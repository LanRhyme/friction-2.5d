/*
#
# Friction - https://friction.graphics
#
# Copyright (c) Ole-André Rodlie and contributors
#
# See 'README.md' for more information.
#
*/

#ifndef SHATTEREFFECT_H
#define SHATTEREFFECT_H

#include "rastereffect.h"

class CORE_EXPORT ShatterEffect : public RasterEffect {
    e_OBJECT
    Q_OBJECT
public:
    ShatterEffect();

    stdsptr<RasterEffectCaller> getEffectCaller(
            const qreal relFrame, const qreal resolution,
            const qreal influence, BoxRenderData * const data) const override;
private:
    qsptr<QrealAnimator> mProgress;
    qsptr<QrealAnimator> mPieces;
    qsptr<QrealAnimator> mDispersion;
    qsptr<QrealAnimator> mGravity;
    qsptr<QrealAnimator> mRotation;
    qsptr<QrealAnimator> mSeed;
};

#endif // SHATTEREFFECT_H
