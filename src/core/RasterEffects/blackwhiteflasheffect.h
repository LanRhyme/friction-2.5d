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

#ifndef BLACKWHITEFLASHEFFECT_H
#define BLACKWHITEFLASHEFFECT_H

#include "rastereffect.h"
#include "skia/skiaincludes.h"

class QrealAnimator;
class ColorAnimator;
class BwfCenterPoint;

// Faithful port of the BWF After Effects plugin (BWF.cpp):
// Threshold > SDF > ContourDP > NormalEmission > RadialBlur,
// single-threaded whole-image CPU pipeline, cpuOnly by design.
// The light/blur center is a pair of QrealAnimator rows (a
// QPointFAnimator/StaticComplexAnimator row never shows up in the
// properties panel in this framework) plus a draggable canvas point.
class CORE_EXPORT BlackWhiteFlashEffect : public RasterEffect {
    e_OBJECT
    Q_OBJECT
public:
    BlackWhiteFlashEffect();

    stdsptr<RasterEffectCaller> getEffectCaller(
            const qreal relFrame,
            const qreal resolution,
            const qreal influence,
            BoxRenderData * const data) const override;

private:
    friend class BwfCenterPoint;

    qsptr<QrealAnimator> mThreshold;       // 阈值 0..255, default 34
    qsptr<QrealAnimator> mContrast;        // 对比度 50..300, default 142
    qsptr<QrealAnimator> mEdgeIntensity;   // 边缘强度 0..100, default 50
    qsptr<QrealAnimator> mCenterX;         // 光线/模糊中心 X, default 0
    qsptr<QrealAnimator> mCenterY;         // 光线/模糊中心 Y, default 0
    qsptr<QrealAnimator> mLightIntensity;  // 光线强度 0..100, default 80
    qsptr<QrealAnimator> mLightLength;     // 光线长度 1..300, default 196
    qsptr<QrealAnimator> mContourSimplify; // 轮廓简化 0..50, default 1
    qsptr<QrealAnimator> mLineDensity;     // 法线采样密度 1..20, default 1
    qsptr<QrealAnimator> mBlurStrength;    // 模糊强度 0..100, default 15
    qsptr<QrealAnimator> mBlurQuality;     // 模糊品质 2..16, default 15
    qsptr<QrealAnimator> mFlashIntensity;  // 闪光强度 0..100, default 100
    qsptr<ColorAnimator> mFlashColor;      // 闪光颜色, white
    qsptr<ColorAnimator> mBgColor;         // 背景颜色, black
};

#endif // BLACKWHITEFLASHEFFECT_H
