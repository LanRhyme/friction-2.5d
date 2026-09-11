/*
#
# Friction - https://friction.graphics
#
# Copyright (c) Ole-André Rodlie and contributors
#
# See 'README.md' for more information.
#
*/

#ifndef SMEAREFFECT_H
#define SMEAREFFECT_H

#include "rastereffect.h"

class CORE_EXPORT SmearEffect : public RasterEffect {
    e_OBJECT
    Q_OBJECT
public:
    SmearEffect();

    stdsptr<RasterEffectCaller> getEffectCaller(
            const qreal relFrame, const qreal resolution,
            const qreal influence, BoxRenderData * const data) const override;
private:
    qsptr<QrealAnimator> mFromX;
    qsptr<QrealAnimator> mFromY;
    qsptr<QrealAnimator> mToX;
    qsptr<QrealAnimator> mToY;
    qsptr<QrealAnimator> mRadius;
    qsptr<QrealAnimator> mElasticity;
};

#endif // SMEAREFFECT_H
