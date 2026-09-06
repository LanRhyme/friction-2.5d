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

#ifndef PIXELATEEFFECT_H
#define PIXELATEEFFECT_H

#include "rastereffect.h"

class QrealAnimator;

// Faithful port of the user's Pixelate After Effects plugin
// (AE SDK Examples/Effect/Pixelate): 9 params with AE ranges and
// defaults, whole-image median-cut palette pipeline, cpuOnly by
// design (multi-pass, order-dependent stages cannot run as a
// single-pass fragment shader).
class PixelateEffect : public RasterEffect {
public:
    PixelateEffect();

    stdsptr<RasterEffectCaller> getEffectCaller(
            const qreal relFrame, const qreal resolution,
            const qreal influence, BoxRenderData * const data) const override;
private:
    qsptr<QrealAnimator> mPixelSize;     // 像素大小 1..64, 默认 12
    qsptr<QrealAnimator> mPaletteSize;   // 调色板大小 2..256, 默认 32
    qsptr<QrealAnimator> mDither;        // 抖动强度 0..100, 默认 7
    qsptr<QrealAnimator> mEdgeSharpness; // 边缘锐化 0..100, 默认 41
    qsptr<QrealAnimator> mColorBanding;  // 色带 0..100, 默认 4
    qsptr<QrealAnimator> mSaturation;    // 饱和度增强 0..200, 默认 16
    qsptr<QrealAnimator> mHoneycomb;     // 蜂窝强度 0..100, 默认 3
    qsptr<QrealAnimator> mScanline;      // 扫描线强度 0..100, 默认 27
    qsptr<QrealAnimator> mChromatic;     // 色差 0..100, 默认 67
};

#endif // PIXELATEEFFECT_H
