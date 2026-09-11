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

#ifndef SUBPATHEFFECT_H
#define SUBPATHEFFECT_H
#include "PathEffects/patheffect.h"
#include "Animators/qrealanimator.h"
#include "Properties/boolproperty.h"

class CORE_EXPORT SubPathEffect : public PathEffect {
    e_OBJECT
protected:
    SubPathEffect();
public:
    stdsptr<PathEffectCaller> getEffectCaller(
            const qreal relFrame, const qreal influence) const;

    void setSubPathValues(const qreal min, const qreal max, const qreal offset = 0.0);
    QrealAnimator *minAnimator() const { return mMin.get(); }
    QrealAnimator *maxAnimator() const { return mMax.get(); }
    QrealAnimator *offsetAnimator() const { return mOffset.get(); }
    BoolProperty *pathWiseProperty() const { return mPathWise.get(); }
private:
    qsptr<BoolProperty> mPathWise;
    qsptr<QrealAnimator> mMin;
    qsptr<QrealAnimator> mMax;
    qsptr<QrealAnimator> mOffset;
};

#endif // SUBPATHEFFECT_H
