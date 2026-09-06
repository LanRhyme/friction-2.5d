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

// Fork of enve - Copyright (C) 2016-2020 Maurycy Liebner

#ifndef PATHPOINTBINDING_H
#define PATHPOINTBINDING_H

#include "propertybindingbase.h"

class BoundingBox;

// read-only binding onto another layer's path endpoint geometry:
//   $path("layerName").start.x / start.y / start.angle
//   $path("layerName").end.x   / end.y   / end.angle
// the angle is the tangent direction in degrees (path travel
// direction, AE expression atan2 semantics); dragging the source
// layer's endpoint nodes re-evaluates dependent expressions live
class CORE_EXPORT PathPointBinding : public PropertyBindingBase {
    Q_OBJECT
    PathPointBinding(const QString& layerName,
                     const bool end,
                     const int component,
                     const Property* const context);
public:
    // component: 0 = x, 1 = y, 2 = angle
    static qsptr<PathPointBinding> sCreate(const QString& layerName,
                                           const bool end,
                                           const int component,
                                           const Property* const context);

    QJSValue getJSValue(QJSEngine& e);
    QJSValue getJSValue(QJSEngine& e, const qreal relFrame);

    FrameRange identicalRelRange(const int absFrame);
    FrameRange nextNonUnaryIdenticalRelRange(const int absFrame);
    QString path() const;
    // out-of-line: QPointer<BoundingBox> needs the complete type,
    // headers including this one only forward-declare BoundingBox
    bool isValid() const;
private:
    qreal readValue(const qreal relFrame, bool& ok) const;
    void resolveSource();

    const QString mLayerName;
    const bool mEnd;
    const int mComponent;
    qptr<BoundingBox> mSource;
};

#endif // PATHPOINTBINDING_H
