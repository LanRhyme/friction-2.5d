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

#include "dashpatheffect.h"
#include "Animators/qrealanimator.h"

DashPathEffect::DashPathEffect() :
    PathEffect(QObject::tr("Dash"), PathEffectType::DASH) {
    mSize = enve::make_shared<QrealAnimator>("size");
    mSize->setValueRange(0.1, 9999.999);
    mSize->setCurrentBaseValue(5);

    mGap = enve::make_shared<QrealAnimator>("gap");
    mGap->setValueRange(0., 9999.999);
    mGap->setCurrentBaseValue(5);

    mOffset = enve::make_shared<QrealAnimator>("offset");
    mOffset->setValueRange(-9999.999, 9999.999);
    mOffset->setCurrentBaseValue(0);

    ca_addChild(mSize);
    ca_addChild(mGap);
    ca_addChild(mOffset);

    ca_setGUIProperty(mSize.get());
}

void DashPathEffect::setDashValues(const qreal dash, const qreal gap,
                                   const qreal offset)
{
    if (mSize) { mSize->setCurrentBaseValue(dash); }
    if (mGap) { mGap->setCurrentBaseValue(gap); }
    if (mOffset) { mOffset->setCurrentBaseValue(offset); }
}

class DashEffectCaller : public PathEffectCaller {
public:
    DashEffectCaller(const qreal dash, const qreal gap, const qreal phase)
        : mDash(toSkScalar(qMax(0.1, dash)))
        , mGap(toSkScalar(qMax(0., gap)))
        , mPhase(toSkScalar(phase))
    {}

    void apply(SkPath& path);
private:
    const float mDash;
    const float mGap;
    const float mPhase;
};

void DashEffectCaller::apply(SkPath &path) {
    SkPath src;
    path.swap(src);
    path.setFillType(src.getFillType());
    const float intervals[] = { mDash, mGap };
    SkStrokeRec rec(SkStrokeRec::kHairline_InitStyle);
    SkRect cullRec = src.getBounds();
    const auto effect = SkDashPathEffect::Make(intervals, 2, mPhase);
    if (!effect) { path.swap(src); return; }
    effect->filterPath(&path, src, &rec, &cullRec);
}

stdsptr<PathEffectCaller> DashPathEffect::getEffectCaller(
        const qreal relFrame, const qreal influence) const {
    const qreal dash = mSize->getEffectiveValue(relFrame)*influence;
    const qreal gap = mGap->getEffectiveValue(relFrame)*influence;
    const qreal offset = mOffset->getEffectiveValue(relFrame);
    return enve::make_shared<DashEffectCaller>(dash, gap, offset);
}
