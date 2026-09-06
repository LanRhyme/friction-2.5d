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

#include "pathpointbinding.h"

#include "Boxes/boundingbox.h"
#include "Boxes/containerbox.h"
#include "Boxes/smartvectorpath.h"
#include "canvas.h"
#include "Animators/SmartPath/smartpathcollection.h"
#include "Animators/SmartPath/smartpathanimator.h"

#include <QVector>
#include <cmath>

#include "include/core/SkPathMeasure.h"

namespace {
SmartVectorPath* findPathLayerByName(ContainerBox* const parent,
                                     const QString& name)
{
    if (!parent) { return nullptr; }
    for (const auto& child : parent->getContained()) {
        const auto box = enve_cast<BoundingBox*>(child.get());
        if (!box) { continue; }
        if (box->prp_getName() == name) {
            const auto svp = enve_cast<SmartVectorPath*>(box);
            if (svp) { return svp; }
        }
        const auto group = enve_cast<ContainerBox*>(box);
        if (group) {
            const auto found = findPathLayerByName(group, name);
            if (found) { return found; }
        }
    }
    return nullptr;
}

Canvas* sceneForBox(BoundingBox* const box)
{
    auto parent = box ? box->getParentGroup() : nullptr;
    while (parent) {
        const auto scene = enve_cast<Canvas*>(parent);
        if (scene) { return scene; }
        parent = parent->getParentGroup();
    }
    return nullptr;
}
}

PathPointBinding::PathPointBinding(const QString& layerName,
                                   const bool end,
                                   const int component,
                                   const Property* const context)
    : PropertyBindingBase(context)
    , mLayerName(layerName)
    , mEnd(end)
    , mComponent(component)
{}

qsptr<PathPointBinding> PathPointBinding::sCreate(
        const QString& layerName, const bool end, const int component,
        const Property* const context)
{
    const auto result = new PathPointBinding(layerName, end, component,
                                             context);
    result->resolveSource();
    if (!result->mSource) { return nullptr; }
    return qsptr<PathPointBinding>(result);
}

void PathPointBinding::resolveSource()
{
    const auto box = mContext ?
                mContext->getFirstAncestor<BoundingBox>() : nullptr;
    const auto scene = sceneForBox(box);
    const auto src = findPathLayerByName(scene, mLayerName);
    if (!src || src == box) { return; }
    mSource = src;
    // live re-evaluation: any path change in the source layer (node
    // drags, keyframe changes) re-runs every expression bound to it;
    // three trigger surfaces so no change kind is missed
    const auto anim = src->getPathAnimator();
    if (anim) {
        connect(anim, &Property::prp_currentFrameChanged,
                this, &PathPointBinding::currentValueChanged);
        connect(anim, &Property::prp_afterChangedRelRange,
                this, [this](const FrameRange&) {
            emit currentValueChanged();
        });
    }
    connect(src, &Property::prp_currentFrameChanged,
            this, &PathPointBinding::currentValueChanged);
    connect(src, &QObject::destroyed,
            this, &PathPointBinding::currentValueChanged);
}

bool PathPointBinding::isValid() const
{
    return mSource;
}

qreal PathPointBinding::readValue(const qreal relFrame, bool& ok) const
{
    ok = false;
    const auto svp = enve_cast<SmartVectorPath*>(mSource.data());
    if (!svp) { return 0.; }
    const auto path = svp->getRelativePath(relFrame);
    SkPathMeasure measure(path, false);
    if (!measure.getLength()) { return 0.; }
    const SkScalar at = mEnd ? measure.getLength() : 0;
    SkPoint pos;
    SkVector tan;
    if (!measure.getPosTan(at, &pos, &tan)) { return 0.; }
    ok = true;
    // map through the source layer's own transform (the CEP position
    // expression is line-transform + path end point): moving/rotating
    // the source layer drags the bound shape along, AE style
    const auto relTransform = svp->getRelativeTransformAtFrame(relFrame);
    if (mComponent == 0 || mComponent == 1) {
        const auto mapped = relTransform.map(QPointF(qreal(pos.x()),
                                                     qreal(pos.y())));
        return mComponent == 0 ? mapped.x() : mapped.y();
    }
    const qreal srcRot = std::atan2(qreal(relTransform.m12()),
                                    qreal(relTransform.m11())) * 180. / M_PI;
    return std::atan2(qreal(tan.y()), qreal(tan.x())) * 180. / M_PI + srcRot;
}

QJSValue PathPointBinding::getJSValue(QJSEngine& e)
{
    Q_UNUSED(e)
    bool ok = false;
    const qreal val = readValue(relFrame(), ok);
    return ok ? QJSValue(val) : QJSValue(0);
}

QJSValue PathPointBinding::getJSValue(QJSEngine& e,
                                      const qreal relFrame)
{
    Q_UNUSED(e)
    bool ok = false;
    const qreal val = readValue(relFrame, ok);
    return ok ? QJSValue(val) : QJSValue(0);
}

FrameRange PathPointBinding::identicalRelRange(const int absFrame)
{
    // path nodes can be animated, so every frame must re-evaluate
    Q_UNUSED(absFrame)
    return FrameRange::EMINMAX;
}

FrameRange PathPointBinding::nextNonUnaryIdenticalRelRange(const int absFrame)
{
    Q_UNUSED(absFrame)
    return FrameRange::EMINMAX;
}

QString PathPointBinding::path() const
{
    QString comp;
    switch (mComponent) {
    case 0: comp = QStringLiteral("x"); break;
    case 1: comp = QStringLiteral("y"); break;
    default: comp = QStringLiteral("angle"); break;
    }
    return QStringLiteral("$path(\"%1\").%2.%3")
            .arg(mLayerName, mEnd ? QStringLiteral("end")
                                  : QStringLiteral("start"), comp);
}
