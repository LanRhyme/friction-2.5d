/*
#
# Friction - https://friction.graphics
#
# Copyright (c) Ole-André Rodlie and contributors.
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
# See 'README.md' for more information.
#
*/

#include "mcpserver.h"
#include "mcpdispatcher.h"
#include "appsupport.h"

#include <QLocalSocket>
#include <QTcpSocket>
#include <QCoreApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QUrlQuery>
#include <QPointer>
#include <QUuid>
#include <QDebug>

namespace Friction
{
    namespace AI
    {
        namespace
        {
            // request bodies larger than this are rejected (memory guard)
            constexpr int kMaxHttpBody = 32 * 1024 * 1024;
            // guard against unbounded header floods
            constexpr int kMaxHttpHeader = 64 * 1024;
            // single newline-delimited JSON message on the pipe
            constexpr int kMaxPipeLine = 16 * 1024 * 1024;
        }

        McpServer *McpServer::sInstance = nullptr;

        McpServer::McpServer(QObject *parent)
            : QObject(parent)
            , mDispatcher(std::make_unique<McpDispatcher>(this))
        {
            sInstance = this;
        }

        McpServer::~McpServer()
        {
            stop();
            if (sInstance == this) {
                sInstance = nullptr;
            }
        }

        McpServer *McpServer::instance()
        {
            return sInstance;
        }

        bool McpServer::isRunning() const
        {
            return (mLocalServer && mLocalServer->isListening()) ||
                   (mTcpServer && mTcpServer->isListening());
        }

        QString McpServer::httpUrl() const
        {
            if (mTcpServer && mTcpServer->isListening()) {
                return QStringLiteral("http://127.0.0.1:%1").arg(mPort);
            }
            return QString();
        }

        QString McpServer::ensureToken()
        {
            auto token = AppSupport::getSettings(QStringLiteral("ai"),
                                                 QStringLiteral("token")).toString();
            if (token.trimmed().isEmpty()) {
                token = QUuid::createUuid().toString(QUuid::WithoutBraces);
                AppSupport::setSettings(QStringLiteral("ai"),
                                        QStringLiteral("token"), token);
            }
            return token;
        }

        void McpServer::refreshToken()
        {
            mToken = ensureToken();
        }

        bool McpServer::start(const quint16 port,
                              const QString &socketName)
        {
            stop();

            mPort = port;
            mToken = ensureToken();
            mSocketName = socketName.isEmpty() ?
#ifdef Q_OS_WIN
                QStringLiteral("friction_mcp")
#else
                QStringLiteral("/tmp/friction_mcp.sock")
#endif
                : socketName;

            // Start Local Socket Server (Unix Domain Socket / Windows Named Pipe)
#ifndef Q_OS_WIN
            QLocalServer::removeServer(mSocketName);
#endif
            mLocalServer = new QLocalServer(this);
            connect(mLocalServer, &QLocalServer::newConnection,
                    this, &McpServer::handleNewLocalConnection);

            const bool localOk = mLocalServer->listen(mSocketName);
            if (!localOk) {
                qWarning() << "[McpServer] Failed to listen on local socket:" << mSocketName << mLocalServer->errorString();
            } else {
                qDebug() << "[McpServer] Local socket listening on:" << mSocketName;
            }

            // Start TCP Server (for HTTP / REST / JSON-RPC)
            mTcpServer = new QTcpServer(this);
            connect(mTcpServer, &QTcpServer::newConnection,
                    this, &McpServer::handleNewTcpConnection);

            const bool tcpOk = mTcpServer->listen(QHostAddress::LocalHost, mPort);
            if (!tcpOk) {
                qWarning() << "[McpServer] Failed to listen on TCP port:" << mPort << mTcpServer->errorString();
            } else {
                qDebug() << "[McpServer] HTTP & JSON-RPC server listening on:" << httpUrl();
            }

            if (localOk || tcpOk) {
                emit serverStarted();
                return true;
            }
            return false;
        }

        void McpServer::stop()
        {
            if (mLocalServer) {
                if (mLocalServer->isListening()) {
                    mLocalServer->close();
                }
                mLocalServer->deleteLater();
                mLocalServer = nullptr;
            }
#ifndef Q_OS_WIN
            if (!mSocketName.isEmpty()) {
                QLocalServer::removeServer(mSocketName);
            }
#endif
            if (mTcpServer) {
                if (mTcpServer->isListening()) {
                    mTcpServer->close();
                }
                mTcpServer->deleteLater();
                mTcpServer = nullptr;
            }
            mHttpReqs.clear();
            emit serverStopped();
        }

        void McpServer::handleNewLocalConnection()
        {
            if (!mLocalServer) { return; }
            while (mLocalServer->hasPendingConnections()) {
                auto socket = mLocalServer->nextPendingConnection();
                if (!socket) { continue; }
                emit clientConnected();
                connect(socket, &QLocalSocket::readyRead,
                        this, &McpServer::handleLocalSocketReadyRead);
                connect(socket, &QLocalSocket::disconnected,
                        socket, &QLocalSocket::deleteLater);
            }
        }

        void McpServer::handleLocalSocketReadyRead()
        {
            auto socket = qobject_cast<QLocalSocket*>(sender());
            if (!socket) { return; }

            while (socket->canReadLine()) {
                const QByteArray line = socket->readLine().trimmed();
                if (line.isEmpty()) { continue; }
                if (line.size() > kMaxPipeLine) {
                    QJsonObject errResp;
                    errResp[QStringLiteral("jsonrpc")] = QStringLiteral("2.0");
                    errResp[QStringLiteral("id")] = QJsonValue();
                    errResp[QStringLiteral("error")] = QJsonObject{
                        {QStringLiteral("code"), -32600},
                        {QStringLiteral("message"), QStringLiteral("Message too large")}
                    };
                    socket->write(QJsonDocument(errResp).toJson(QJsonDocument::Compact) + "\n");
                    socket->flush();
                    continue;
                }

                QJsonParseError parseErr;
                const auto doc = QJsonDocument::fromJson(line, &parseErr);
                if (parseErr.error != QJsonParseError::NoError ||
                        (!doc.isObject() && !doc.isArray())) {
                    QJsonObject errResp;
                    errResp[QStringLiteral("jsonrpc")] = QStringLiteral("2.0");
                    errResp[QStringLiteral("error")] = QJsonObject{
                        {QStringLiteral("code"), -32700},
                        {QStringLiteral("message"), QStringLiteral("Parse error (send compact single-line JSON)")}
                    };
                    socket->write(QJsonDocument(errResp).toJson(QJsonDocument::Compact) + "\n");
                    socket->flush();
                    continue;
                }

                QPointer<QLocalSocket> guard(socket);
                processJsonRpcDoc(doc, [guard](const QJsonDocument &respDoc) {
                    if (respDoc.isNull() || !guard) { return; }
                    guard->write(QJsonDocument(respDoc).toJson(QJsonDocument::Compact) + "\n");
                    guard->flush();
                });
            }
        }

        void McpServer::handleNewTcpConnection()
        {
            if (!mTcpServer) { return; }
            while (mTcpServer->hasPendingConnections()) {
                auto socket = mTcpServer->nextPendingConnection();
                if (!socket) { continue; }
                emit clientConnected();
                mHttpReqs.insert(socket, HttpReq());
                connect(socket, &QTcpSocket::readyRead,
                        this, &McpServer::handleTcpSocketReadyRead);
                connect(socket, &QTcpSocket::disconnected,
                        this, &McpServer::handleTcpSocketDisconnected);
                connect(socket, &QTcpSocket::disconnected,
                        socket, &QTcpSocket::deleteLater);
            }
        }

        void McpServer::handleTcpSocketDisconnected()
        {
            auto socket = qobject_cast<QTcpSocket*>(sender());
            if (socket) { mHttpReqs.remove(socket); }
        }

        QString McpServer::headerValue(const QByteArray &head,
                                       const char *name)
        {
            const auto lines = head.split('\n');
            for (const auto &rawLine : lines) {
                const QByteArray line = rawLine.trimmed();
                const int colon = line.indexOf(':');
                if (colon < 0) { continue; }
                if (line.left(colon).trimmed().compare(name, Qt::CaseInsensitive) == 0) {
                    return QString::fromLatin1(line.mid(colon + 1).trimmed());
                }
            }
            return QString();
        }

        void McpServer::handleTcpSocketReadyRead()
        {
            auto socket = qobject_cast<QTcpSocket*>(sender());
            if (!socket) { return; }

            if (!mHttpReqs.contains(socket)) {
                mHttpReqs.insert(socket, HttpReq());
            }
            auto &req = mHttpReqs[socket];
            req.buffer += socket->readAll();

            if (req.buffer.size() > kMaxHttpHeader + kMaxHttpBody) {
                sendHttpResponse(socket, 413, QStringLiteral("Payload Too Large"),
                                 "{\"error\":\"Request too large\"}");
                socket->disconnectFromHost();
                return;
            }

            if (req.headerLen < 0) {
                const int headerEnd = req.buffer.indexOf("\r\n\r\n");
                if (headerEnd < 0) {
                    if (req.buffer.size() > kMaxHttpHeader) {
                        sendHttpResponse(socket, 400, QStringLiteral("Bad Request"),
                                         "{\"error\":\"Header section too large\"}");
                        socket->disconnectFromHost();
                    }
                    return; // header not complete yet
                }
                req.headerLen = headerEnd + 4;
                const QByteArray head = req.buffer.left(headerEnd);

                const auto headLines = QString::fromLatin1(head).split(QStringLiteral("\r\n"));
                const auto reqLineParts = headLines.isEmpty() ?
                            QStringList() : headLines.first().split(' ');
                if (reqLineParts.size() < 2) {
                    sendHttpResponse(socket, 400, QStringLiteral("Bad Request"),
                                     "{\"error\":\"Malformed request\"}");
                    socket->disconnectFromHost();
                    return;
                }
                const QString method = reqLineParts.at(0).toUpper();
                const bool hasBody = (method == QStringLiteral("POST")) ||
                                     (method == QStringLiteral("PUT"));
                if (hasBody) {
                    const QString cl = headerValue(head, "Content-Length");
                    bool clOk = false;
                    const int clVal = cl.toInt(&clOk);
                    if (!clOk || clVal < 0) {
                        sendHttpResponse(socket, 411, QStringLiteral("Length Required"),
                                         "{\"error\":\"Content-Length required (chunked bodies not supported)\"}");
                        socket->disconnectFromHost();
                        return;
                    }
                    if (clVal > kMaxHttpBody) {
                        sendHttpResponse(socket, 413, QStringLiteral("Payload Too Large"),
                                         "{\"error\":\"Request body too large\"}");
                        socket->disconnectFromHost();
                        return;
                    }
                    req.contentLength = clVal;
                    const QString expect = headerValue(head, "Expect");
                    if (!expect.isEmpty() &&
                            expect.compare(QStringLiteral("100-continue"), Qt::CaseInsensitive) == 0 &&
                            !req.continueSent) {
                        req.continueSent = true;
                        socket->write("HTTP/1.1 100 Continue\r\n\r\n");
                        socket->flush();
                    }
                } else {
                    req.contentLength = 0;
                }
            }

            if (req.contentLength < 0) { return; }
            if (req.buffer.size() - req.headerLen < req.contentLength) {
                return; // body not complete yet
            }

            const QByteArray head = req.buffer.left(req.headerLen - 4);
            const QByteArray body = req.buffer.mid(req.headerLen, req.contentLength);
            handleHttpRequest(socket, head, body);
        }

        void McpServer::sendHttpResponse(QTcpSocket *socket, int statusCode,
                                         const QString &statusText,
                                         const QByteArray &body,
                                         const QString &contentType)
        {
            if (!socket) { return; }

            QByteArray header;
            header += QStringLiteral("HTTP/1.1 %1 %2\r\n").arg(
                        QString::number(statusCode), statusText).toUtf8();
            header += "Content-Type: " + contentType.toUtf8() + "\r\n";
            header += "Content-Length: " + QByteArray::number(body.size()) + "\r\n";
            // no CORS headers on purpose: browser pages must not be
            // able to drive this local service; native clients are
            // unaffected by CORS
            header += "Cache-Control: no-store\r\n";
            header += "Connection: close\r\n";
            header += "\r\n";

            socket->write(header);
            socket->write(body);
            socket->flush();
            socket->disconnectFromHost();
        }

        bool McpServer::isAuthorized(const QString &method,
                                      const QString &rawPath,
                                      const QByteArray &head) const
        {
            // liveness probe endpoints stay open (no project data)
            if (method == QStringLiteral("GET") &&
                    (rawPath == QStringLiteral("/") ||
                     rawPath == QStringLiteral("/api/status"))) {
                return true;
            }
            // any browser-originated cross-origin call is rejected
            if (!headerValue(head, "Origin").isEmpty()) {
                return false;
            }
            // DNS-rebinding guard: the request must target our loopback
            const QString host = headerValue(head, "Host");
            if (!host.isEmpty()) {
                const bool hostOk = host.startsWith(QStringLiteral("127.0.0.1")) ||
                                    host.startsWith(QStringLiteral("localhost")) ||
                                    host.startsWith(QStringLiteral("[::1]"));
                if (!hostOk) { return false; }
            }
            // token: Authorization: Bearer <t> | X-Friction-Token: <t>
            // | ?token=<t>
            const QString auth = headerValue(head, "Authorization");
            if (auth.startsWith(QStringLiteral("Bearer "), Qt::CaseInsensitive) &&
                    auth.mid(7).trimmed() == mToken) {
                return true;
            }
            if (headerValue(head, "X-Friction-Token") == mToken) {
                return true;
            }
            const int queryStart = rawPath.indexOf(QLatin1Char('?'));
            if (queryStart >= 0) {
                const QUrlQuery query(rawPath.mid(queryStart + 1));
                if (query.queryItemValue(QStringLiteral("token")) == mToken) {
                    return true;
                }
            }
            return false;
        }

        void McpServer::handleHttpRequest(QTcpSocket *socket,
                                          const QByteArray &head,
                                          const QByteArray &body)
        {
            const QString headStr = QString::fromLatin1(head);
            const QStringList lines = headStr.split(QStringLiteral("\r\n"));
            if (lines.isEmpty()) { return; }

            const QStringList reqLines = lines.first().split(' ');
            if (reqLines.size() < 2) { return; }

            const QString method = reqLines.at(0).toUpper();
            const QString rawPath = reqLines.at(1);

            if (method == QStringLiteral("OPTIONS")) {
                // answered without CORS headers, so browsers cannot
                // use the preflight; harmless for native clients
                sendHttpResponse(socket, 204, QStringLiteral("No Content"), "");
                return;
            }

            if (!isAuthorized(method, rawPath, head)) {
                sendHttpResponse(socket, 401, QStringLiteral("Unauthorized"),
                                 "{\"error\":\"Unauthorized: valid token required (Authorization: Bearer <token>, X-Friction-Token header or ?token= query; see AI settings for the token)\"}");
                return;
            }

            const QString path = rawPath.contains(QLatin1Char('?')) ?
                        rawPath.left(rawPath.indexOf(QLatin1Char('?'))) : rawPath;

            if (method == QStringLiteral("GET")) {
                if (path == QStringLiteral("/") || path == QStringLiteral("/api/status")) {
                    QJsonObject status;
                    status[QStringLiteral("status")] = QStringLiteral("online");
                    status[QStringLiteral("app")] = QStringLiteral("Friction 2.5D");
                    status[QStringLiteral("version")] = AppSupport::getAppVersion();
                    status[QStringLiteral("mcp")] = true;
                    status[QStringLiteral("port")] = mPort;
                    sendHttpResponse(socket, 200, QStringLiteral("OK"), QJsonDocument(status).toJson());
                    return;
                } else if (path == QStringLiteral("/api/scene")) {
                    const auto res = mDispatcher->dispatchTool(QStringLiteral("friction_get_scene_info"), QJsonObject());
                    sendHttpResponse(socket, 200, QStringLiteral("OK"), QJsonDocument(res).toJson());
                    return;
                } else if (path == QStringLiteral("/api/layers")) {
                    const auto res = mDispatcher->dispatchTool(QStringLiteral("friction_list_layers"), QJsonObject());
                    sendHttpResponse(socket, 200, QStringLiteral("OK"), QJsonDocument(res).toJson());
                    return;
                } else if (path == QStringLiteral("/api/schema")) {
                    const auto res = mDispatcher->dispatchTool(QStringLiteral("friction_get_api_schema"), QJsonObject());
                    sendHttpResponse(socket, 200, QStringLiteral("OK"), QJsonDocument(res).toJson());
                    return;
                } else if (path == QStringLiteral("/api/screenshot")) {
                    const auto res = mDispatcher->captureViewport(QStringLiteral("png"), 90);
                    if (rawPath.contains(QStringLiteral("raw=true")) ||
                            rawPath.contains(QStringLiteral("format=binary"))) {
                        const QByteArray rawBytes = QByteArray::fromBase64(
                                    res.value(QStringLiteral("data")).toString().toLatin1());
                        sendHttpResponse(socket, 200, QStringLiteral("OK"), rawBytes,
                                         QStringLiteral("image/png"));
                    } else {
                        sendHttpResponse(socket, 200, QStringLiteral("OK"), QJsonDocument(res).toJson());
                    }
                    return;
                }
            } else if (method == QStringLiteral("POST")) {
                QJsonParseError parseErr;
                const auto bodyDoc = QJsonDocument::fromJson(body, &parseErr);
                if (parseErr.error != QJsonParseError::NoError) {
                    sendHttpResponse(socket, 400, QStringLiteral("Bad Request"),
                                     "{\"error\":\"Invalid JSON body\"}");
                    return;
                }
                const QJsonObject bodyObj = bodyDoc.isObject() ? bodyDoc.object() : QJsonObject();

                if (path == QStringLiteral("/api/eval")) {
                    const QString code = bodyObj.value(QStringLiteral("script")).toString();
                    const QString grp = bodyObj.value(QStringLiteral("undoGroupName"))
                            .toString(QStringLiteral("AI HTTP Action"));
                    const auto res = mDispatcher->evalScript(code, grp);
                    sendHttpResponse(socket, 200, QStringLiteral("OK"), QJsonDocument(res).toJson());
                    return;
                } else if (path.startsWith(QStringLiteral("/api/tool/"))) {
                    const QString toolName = path.mid(10);
                    QPointer<QTcpSocket> guard(socket);
                    mDispatcher->dispatchToolAsync(toolName, bodyObj,
                        [this, guard](const QJsonObject &res) {
                        if (!guard) { return; }
                        sendHttpResponse(guard, 200, QStringLiteral("OK"),
                                         QJsonDocument(res).toJson());
                    });
                    return;
                } else if (path == QStringLiteral("/jsonrpc") ||
                           path == QStringLiteral("/mcp") ||
                           path == QStringLiteral("/")) {
                    if (!bodyDoc.isObject() && !bodyDoc.isArray()) {
                        sendHttpResponse(socket, 400, QStringLiteral("Bad Request"),
                                         "{\"error\":\"JSON-RPC object or batch array required\"}");
                        return;
                    }
                    QPointer<QTcpSocket> guard(socket);
                    processJsonRpcDoc(bodyDoc, [this, guard](const QJsonDocument &respDoc) {
                        if (!guard) { return; }
                        if (respDoc.isNull()) {
                            // notification: accepted, nothing to report
                            sendHttpResponse(guard, 202, QStringLiteral("Accepted"), "");
                            return;
                        }
                        sendHttpResponse(guard, 200, QStringLiteral("OK"),
                                         QJsonDocument(respDoc).toJson());
                    });
                    return;
                }
            }

            sendHttpResponse(socket, 404, QStringLiteral("Not Found"),
                             "{\"error\":\"Endpoint not found\"}");
        }

        void McpServer::processJsonRpcDoc(const QJsonDocument &request,
                                          const std::function<void(const QJsonDocument&)> &callback)
        {
            if (request.isArray()) {
                const auto batch = request.array();
                if (batch.isEmpty()) {
                    QJsonObject err;
                    err[QStringLiteral("jsonrpc")] = QStringLiteral("2.0");
                    err[QStringLiteral("id")] = QJsonValue();
                    err[QStringLiteral("error")] = QJsonObject{
                        {QStringLiteral("code"), -32600},
                        {QStringLiteral("message"), QStringLiteral("Empty batch")}
                    };
                    callback(QJsonDocument(err));
                    return;
                }
                const auto results = std::make_shared<QJsonArray>();
                const auto remaining = std::make_shared<int>(batch.count());
                for (const auto &item : batch) {
                    processJsonRpcObj(item.toObject(),
                        [results, remaining, callback](const QJsonObject &resp) {
                        if (!resp.isEmpty()) { results->append(resp); }
                        if (--(*remaining) == 0) {
                            callback(QJsonDocument(*results));
                        }
                    });
                }
                return;
            }
            processJsonRpcObj(request.object(),
                [callback](const QJsonObject &resp) {
                callback(QJsonDocument(resp));
            });
        }

        QJsonObject McpServer::processJsonRpc(const QJsonObject &request)
        {
            QJsonObject result;
            bool done = false;
            processJsonRpcObj(request, [&result, &done](const QJsonObject &resp) {
                result = resp;
                done = true;
            });
            while (!done) {
                QCoreApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
            }
            return result;
        }

        void McpServer::processJsonRpcObj(const QJsonObject &request,
                                          const std::function<void(const QJsonObject&)> &callback)
        {
            const bool hasId = request.contains(QStringLiteral("id"));
            const QJsonValue idVal = request.value(QStringLiteral("id"));
            const QString method = request.value(QStringLiteral("method")).toString();
            const QJsonObject params = request.value(QStringLiteral("params")).toObject();

            // capture by value: the tools/call continuation below is
            // invoked asynchronously, after this scope has returned
            const auto finish = [callback, hasId, idVal](const QJsonObject &payload) {
                if (!hasId) {
                    // JSON-RPC notification: execute side effects but
                    // never answer (spec section: notifications receive
                    // no response)
                    callback(QJsonObject());
                    return;
                }
                QJsonObject response;
                response[QStringLiteral("jsonrpc")] = QStringLiteral("2.0");
                response[QStringLiteral("id")] = idVal;
                if (payload.contains(QStringLiteral("__error"))) {
                    QJsonObject err = payload.value(QStringLiteral("__error")).toObject();
                    response[QStringLiteral("error")] = err;
                } else {
                    response[QStringLiteral("result")] = payload;
                }
                callback(response);
            };

            if (method.isEmpty()) {
                QJsonObject err;
                err[QStringLiteral("code")] = -32600;
                err[QStringLiteral("message")] = QStringLiteral("Invalid request: missing method");
                QJsonObject payload;
                payload[QStringLiteral("__error")] = err;
                finish(payload);
                return;
            }

            // MCP Standard Methods
            if (method == QStringLiteral("initialize")) {
                // protocol version negotiation: honor the client's
                // version when we support it, otherwise fall back
                const QString requested = params.value(QStringLiteral("protocolVersion")).toString();
                QString negotiated = QStringLiteral("2024-11-05");
                if (requested == QStringLiteral("2025-03-26") ||
                        requested == QStringLiteral("2025-06-18")) {
                    negotiated = requested;
                }

                QJsonObject serverInfo;
                serverInfo[QStringLiteral("name")] = QStringLiteral("friction-2.5d");
                serverInfo[QStringLiteral("version")] = AppSupport::getAppVersion();

                QJsonObject capabilities;
                capabilities[QStringLiteral("tools")] = QJsonObject{};
                capabilities[QStringLiteral("resources")] = QJsonObject{};

                QJsonObject result;
                result[QStringLiteral("protocolVersion")] = negotiated;
                result[QStringLiteral("serverInfo")] = serverInfo;
                result[QStringLiteral("capabilities")] = capabilities;
                finish(result);
                return;
            } else if (method == QStringLiteral("notifications/initialized") ||
                       method == QStringLiteral("initialized")) {
                // notification: no response (handled by finish)
                finish(QJsonObject{});
                return;
            } else if (method == QStringLiteral("ping")) {
                finish(QJsonObject{});
                return;
            } else if (method == QStringLiteral("tools/list")) {
                QJsonObject result;
                result[QStringLiteral("tools")] = mDispatcher->getToolsSchema();
                finish(result);
                return;
            } else if (method == QStringLiteral("tools/call") ||
                       method.startsWith(QStringLiteral("friction_"))) {
                QString toolName;
                QJsonObject toolArgs;
                if (method == QStringLiteral("tools/call")) {
                    toolName = params.value(QStringLiteral("name")).toString();
                    toolArgs = params.value(QStringLiteral("arguments")).toObject();
                } else {
                    toolName = method;
                    toolArgs = params;
                }

                mDispatcher->dispatchToolAsync(toolName, toolArgs,
                    [finish](const QJsonObject &toolResult) {
                    const bool isSuccess = toolResult.value(QStringLiteral("success")).toBool(true);
                    QJsonArray contentArray;

                    // If tool returned an image (captureViewport)
                    if (toolResult.contains(QStringLiteral("data")) &&
                            toolResult.contains(QStringLiteral("format"))) {
                        QJsonObject imgContent;
                        imgContent[QStringLiteral("type")] = QStringLiteral("image");
                        imgContent[QStringLiteral("data")] = toolResult.value(QStringLiteral("data")).toString();
                        imgContent[QStringLiteral("mimeType")] = QStringLiteral("image/") +
                                toolResult.value(QStringLiteral("format")).toString();
                        contentArray.append(imgContent);
                    } else {
                        QJsonObject textContent;
                        textContent[QStringLiteral("type")] = QStringLiteral("text");
                        textContent[QStringLiteral("text")] = QString::fromUtf8(
                                    QJsonDocument(toolResult).toJson(QJsonDocument::Indented));
                        contentArray.append(textContent);
                    }

                    QJsonObject result;
                    result[QStringLiteral("content")] = contentArray;
                    result[QStringLiteral("isError")] = !isSuccess;
                    result[QStringLiteral("structuredContent")] = toolResult;
                    finish(result);
                });
                return;
            } else if (method == QStringLiteral("resources/list")) {
                QJsonObject result;
                result[QStringLiteral("resources")] = mDispatcher->getResourcesSchema();
                finish(result);
                return;
            } else if (method == QStringLiteral("resources/read")) {
                const QString uri = params.value(QStringLiteral("uri")).toString();
                finish(mDispatcher->readResource(uri));
                return;
            }

            QJsonObject err;
            err[QStringLiteral("code")] = -32601;
            err[QStringLiteral("message")] = QStringLiteral("Method not found: %1").arg(method);
            QJsonObject payload;
            payload[QStringLiteral("__error")] = err;
            finish(payload);
        }
    }
}
