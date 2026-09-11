/*
#
# Friction - https://friction.graphics
#
# Copyright (c) Ole-André Rodlie and contributors
#
# See 'README.md' for more information.
#
*/

#ifndef ROUGHENEDGESEFFECT_H
#define ROUGHENEDGESEFFECT_H

#include "rastereffect.h"

class QrealAnimator;

class CORE_EXPORT RoughenEdgesEffect : public RasterEffect {
    e_OBJECT
    Q_OBJECT
public:
    RoughenEdgesEffect();

    stdsptr<RasterEffectCaller> getEffectCaller(
            const qreal relFrame,
            const qreal resolution,
            const qreal influence,
            BoxRenderData * const data) const override;

private:
    qsptr<QrealAnimator> mBorder;
    qsptr<QrealAnimator> mEdgeSharpness;
    qsptr<QrealAnimator> mScale;
    qsptr<QrealAnimator> mComplexity;
    qsptr<QrealAnimator> mEvolution;
};

#endif // ROUGHENEDGESEFFECT_H
