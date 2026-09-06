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

#ifndef SCRIPTMANAGER_H
#define SCRIPTMANAGER_H

#include <QObject>
#include <QMap>
#include <QList>
#include <QWidget>
#include <QPainterPath>

class QMenu;
class QAction;
class QDockWidget;
class QPushButton;
class QGridLayout;
class QVBoxLayout;
class QWidget;
class QTimer;
class QPainter;
class MainWindow;
class ScriptConsoleDock;

namespace Friction
{
    namespace Core
    {
        class JsHost;
    }
}

// Paint proxy handed to a script panel's preview onPaint(g) callback.
// Valid only inside the paint callback; every method forwards to the
// internal QPainter (canvas-style API kept deliberately small).
class ScriptPaintProxy : public QObject
{
    Q_OBJECT
public:
    explicit ScriptPaintProxy(QObject * const parent = nullptr);

    void begin(QPainter * const p);
    void end();

    Q_INVOKABLE void clear(const QString &color);
    Q_INVOKABLE void grid(qreal cell, const QString &color);
    Q_INVOKABLE void setStroke(const QString &color, qreal width);
    Q_INVOKABLE void setCap(const QString &cap); // "round"/"butt"/"square"
    Q_INVOKABLE void setDash(qreal dash, qreal gap, qreal offset);
    Q_INVOKABLE void noDash();
    Q_INVOKABLE void beginPath();
    Q_INVOKABLE void moveTo(qreal x, qreal y);
    Q_INVOKABLE void lineTo(qreal x, qreal y);
    Q_INVOKABLE void cubicTo(qreal c1x, qreal c1y,
                             qreal c2x, qreal c2y,
                             qreal x, qreal y);
    Q_INVOKABLE void closePath();
    Q_INVOKABLE void stroke();
    Q_INVOKABLE void fillPoly(const QList<qreal> &xy,
                              const QString &color);
    Q_INVOKABLE void fillCircle(qreal x, qreal y, qreal r,
                                const QString &color);
    Q_INVOKABLE double now(); // ms timestamp for animation phase
private:
    QPainter *mPainter = nullptr;
    QPainterPath mPath;
    bool mPathStarted = false;
    qint64 mEpoch = 0;
};

// Live preview canvas for script panels: paints by invoking the
// script's onPaint callback with a ScriptPaintProxy; repaints on an
// internal timer when animated, or on requestUpdate() otherwise.
class ScriptPreviewWidget : public QWidget
{
    Q_OBJECT
public:
    ScriptPreviewWidget(Friction::Core::JsHost * const host,
                        const int width, const int height,
                        const bool animated,
                        QWidget * const parent);
protected:
    void paintEvent(QPaintEvent * const event) override;
private:
    Friction::Core::JsHost *mHost;
    ScriptPaintProxy mProxy;
    QTimer *mTimer = nullptr;
};

// Loads JS plugins from the user scripts folder, exposes their
// registered commands in the "Scripts" menu and owns the script
// console (REPL) dock. Scripts may also register a panel UI
// (registerPanel) which is shown as a dockable panel.
class ScriptManager : public QObject
{
    Q_OBJECT
public:
    explicit ScriptManager(MainWindow * const parent);

    QMenu *menu() const { return mScriptsMenu; }
    ScriptConsoleDock *console() const { return mConsole; }
    QList<QDockWidget*> panels() const { return mPanels; }

    // console + debug log output (script print()/$.writeln)
    void output(const QString &message);

public slots:
    // rescan the scripts folder, reload every plugin engines and
    // rebuild the commands section of the Scripts menu
    void reload();

private:
    void loadScripts();
    void rebuildMenu();
    void runCommand(const QString &label);
    void createPanel(Friction::Core::JsHost * const host);

    MainWindow *mMainWindow;
    QMenu *mScriptsMenu = nullptr;
    QAction *mReloadAct = nullptr;
    ScriptConsoleDock *mConsole = nullptr;
    // command label -> owning host
    QMap<QString, Friction::Core::JsHost*> mCommands;
    // script panels: host -> dock
    QMap<Friction::Core::JsHost*, QDockWidget*> mPanelHosts;
    QList<QDockWidget*> mPanels;
    // panels open at the moment of a scripts reload, by objectName -
    // lets the rebuilt panels keep their visibility
    QHash<QString, bool> mPanelWasVisible;
    // slider live-preview coalescing: raw sliderMoved rates (30+/s)
    // would flood the undo stack and renderer; tail-merge to one run
    // per 100ms idle
    QTimer *mSliderThrottle = nullptr;
    QString mPendingSliderId;
    qreal mPendingSliderValue = 0.;
    Friction::Core::JsHost *mPendingSliderHost = nullptr;
};

#endif // SCRIPTMANAGER_H
