/*
#
# Friction - https://friction.graphics
#
# Copyright (c) Ole-André Rodlie and contributors
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

#ifndef MCPSERVER_H
#define MCPSERVER_H

#include <QObject>
#include <QLocalServer>
#include <QTcpServer>
#include <QJsonObject>
#include <QJsonDocument>
#include <QHash>
#include <QByteArray>
#include <functional>
#include <memory>

namespace Friction
{
    namespace AI
    {
        class McpDispatcher;

        class McpServer : public QObject
        {
            Q_OBJECT
        public:
            explicit McpServer(QObject *parent = nullptr);
            ~McpServer() override;

            static McpServer *instance();

            bool start(const quint16 port = 9527,
                       const QString &socketName = QString());
            void stop();

            bool isRunning() const;
            quint16 port() const { return mPort; }
            QString socketPath() const { return mSocketName; }
            QString httpUrl() const;

            // persistent access token for the HTTP transport
            // ("ai/token" setting, generated on demand). The local
            // named-pipe transport is exempt: it is only reachable by
            // local processes which already have full machine trust.
            static QString ensureToken();
            void refreshToken();

            McpDispatcher *dispatcher() const { return mDispatcher.get(); }

            // Process a raw JSON-RPC 2.0 / MCP message (single object
            // or batch array). The callback receives a null document
            // for notifications (no response must be written), and
            // the response document once it is ready otherwise.
            // Slow tools (e.g. render_markup) complete asynchronously;
            // the event loop keeps running in the meantime.
            void processJsonRpcDoc(const QJsonDocument &request,
                                   const std::function<void(const QJsonDocument&)> &callback);
            QJsonObject processJsonRpc(const QJsonObject &request);

        signals:
            void serverStarted();
            void serverStopped();
            void clientConnected();
            void logMessage(const QString &msg);

        private slots:
            void handleNewLocalConnection();
            void handleLocalSocketReadyRead();
            void handleNewTcpConnection();
            void handleTcpSocketReadyRead();
            void handleTcpSocketDisconnected();

        private:
            // per-connection HTTP receive state: the body is only
            // dispatched once Content-Length bytes have arrived
            struct HttpReq {
                QByteArray buffer;
                int headerLen = -1;      // offset past the CRLFCRLF terminator
                int contentLength = -1;
                bool continueSent = false;
            };

            void handleHttpRequest(class QTcpSocket *socket,
                                   const QByteArray &head,
                                   const QByteArray &body);
            void sendHttpResponse(class QTcpSocket *socket, int statusCode,
                                  const QString &statusText,
                                  const QByteArray &body,
                                  const QString &contentType = QStringLiteral("application/json"));
            // rejects browser cross-origin calls (Origin header),
            // DNS-rebinding (foreign Host) and missing/invalid tokens
            bool isAuthorized(const QString &method, const QString &rawPath,
                              const QByteArray &head) const;
            static QString headerValue(const QByteArray &head, const char *name);
            void processJsonRpcObj(const QJsonObject &request,
                                   const std::function<void(const QJsonObject&)> &callback);

            static McpServer *sInstance;
            QLocalServer *mLocalServer = nullptr;
            QTcpServer *mTcpServer = nullptr;
            quint16 mPort = 9527;
            QString mSocketName;
            QString mToken;
            QHash<class QTcpSocket*, HttpReq> mHttpReqs;
            std::unique_ptr<McpDispatcher> mDispatcher;
        };
    }
}

#endif // MCPSERVER_H
