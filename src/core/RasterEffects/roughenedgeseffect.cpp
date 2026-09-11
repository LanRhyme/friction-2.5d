/*
#
# Friction - https://friction.graphics
#
# Copyright (c) Ole-André Rodlie and contributors
#
# See 'README.md' for more information.
#
*/

#include "roughenedgeseffect.h"
#include "gpurendertools.h"
#include "openglrastereffectcaller.h"
#include "Animators/qrealanimator.h"
#include "appsupport.h"

RoughenEdgesEffect::RoughenEdgesEffect() :
    RasterEffect(QObject::tr("Roughen Edges"),
                 AppSupport::getRasterEffectHardwareSupport("RoughenEdges",
                                                            HardwareSupport::gpuPreffered),
                 true,
                 RasterEffectType::ROUGHEN_EDGES)
{
    mBorder = enve::make_shared<QrealAnimator>(15.0, 0.0, 200.0, 1.0, "border");
    ca_addChild(mBorder);

    mEdgeSharpness = enve::make_shared<QrealAnimator>(5.0, 0.1, 20.0, 0.5, "edge sharpness");
    ca_addChild(mEdgeSharpness);

    mScale = enve::make_shared<QrealAnimator>(15.0, 1.0, 100.0, 0.5, "scale");
    ca_addChild(mScale);

    mComplexity = enve::make_shared<QrealAnimator>(3.0, 1.0, 5.0, 1.0, "complexity");
    ca_addChild(mComplexity);

    mEvolution = enve::make_shared<QrealAnimator>(0.0, 0.0, 100.0, 1.0, "evolution");
    ca_addChild(mEvolution);
}

class RoughenEdgesEffectCaller : public OpenGLRasterEffectCaller {
public:
    RoughenEdgesEffectCaller(const HardwareSupport hwSupport,
                             const qreal border,
                             const qreal edgeSharpness,
                             const qreal scale,
                             const qreal complexity,
                             const qreal evolution) :
        OpenGLRasterEffectCaller(sInitialized, sProgramId,
                                 ":/shaders/roughenedgeseffect.frag",
                                 hwSupport),
        mBorder(border),
        mEdgeSharpness(edgeSharpness),
        mScale(scale),
        mComplexity(complexity),
        mEvolution(evolution) {}

    void processCpu(CpuRenderTools& renderTools,
                    const CpuRenderData& data) override
    {
        const auto& srcBtmp = renderTools.fSrcBtmp;
        const auto& dstBtmp = renderTools.fDstBtmp;

        if (srcBtmp.empty() || srcBtmp.getPixels() == nullptr ||
            dstBtmp.empty() || dstBtmp.getPixels() == nullptr) {
            return;
        }

        const int imgWidth = srcBtmp.width();
        const int imgHeight = srcBtmp.height();
        if (imgWidth <= 0 || imgHeight <= 0) return;

        const int xMin = std::max(0, data.fTexTile.left());
        const int xMax = std::min((int)data.fTexTile.right(), imgWidth - 1);
        const int yMin = std::max(0, data.fTexTile.top());
        const int yMax = std::min((int)data.fTexTile.bottom(), imgHeight - 1);

        for (int yi = yMin; yi <= yMax; yi++) {
            auto dst = static_cast<uchar*>(dstBtmp.getAddr(0, yi - yMin));
            for (int xi = xMin; xi <= xMax; xi++) {
                const auto src = static_cast<const uchar*>(srcBtmp.getAddr(xi, yi));
                const int offset = (xi - xMin) * 4;
                dst[offset + 0] = src[0];
                dst[offset + 1] = src[1];
                dst[offset + 2] = src[2];
                dst[offset + 3] = src[3];
            }
        }
    }

protected:
    void iniVars(QGL33 * const gl) const override {
        sBorderU = gl->glGetUniformLocation(sProgramId, "border");
        sEdgeSharpnessU = gl->glGetUniformLocation(sProgramId, "edgeSharpness");
        sScaleU = gl->glGetUniformLocation(sProgramId, "scale");
        sComplexityU = gl->glGetUniformLocation(sProgramId, "complexity");
        sEvolutionU = gl->glGetUniformLocation(sProgramId, "evolution");
    }

    void setVars(QGL33 * const gl) const override {
        gl->glUseProgram(sProgramId);
        gl->glUniform1f(sBorderU, toSkScalar(mBorder));
        gl->glUniform1f(sEdgeSharpnessU, toSkScalar(mEdgeSharpness));
        gl->glUniform1f(sScaleU, toSkScalar(mScale));
        gl->glUniform1f(sComplexityU, toSkScalar(mComplexity));
        gl->glUniform1f(sEvolutionU, toSkScalar(mEvolution));
    }

private:
    static bool sInitialized;
    static GLuint sProgramId;

    static GLint sBorderU;
    static GLint sEdgeSharpnessU;
    static GLint sScaleU;
    static GLint sComplexityU;
    static GLint sEvolutionU;

    const qreal mBorder;
    const qreal mEdgeSharpness;
    const qreal mScale;
    const qreal mComplexity;
    const qreal mEvolution;
};

bool RoughenEdgesEffectCaller::sInitialized = false;
GLuint RoughenEdgesEffectCaller::sProgramId = 0;
GLint RoughenEdgesEffectCaller::sBorderU = 0;
GLint RoughenEdgesEffectCaller::sEdgeSharpnessU = 0;
GLint RoughenEdgesEffectCaller::sScaleU = 0;
GLint RoughenEdgesEffectCaller::sComplexityU = 0;
GLint RoughenEdgesEffectCaller::sEvolutionU = 0;

stdsptr<RasterEffectCaller> RoughenEdgesEffect::getEffectCaller(
        const qreal relFrame,
        const qreal resolution,
        const qreal influence,
        BoxRenderData * const data) const
{
    Q_UNUSED(resolution)
    Q_UNUSED(data)
    const auto hwSupport = instanceHwSupport();
    const auto border = mBorder->getEffectiveValue(relFrame) * influence;
    const auto edgeSharpness = mEdgeSharpness->getEffectiveValue(relFrame);
    const auto scale = mScale->getEffectiveValue(relFrame);
    const auto complexity = mComplexity->getEffectiveValue(relFrame);
    const auto evolution = mEvolution->getEffectiveValue(relFrame);
    return enve::make_shared<RoughenEdgesEffectCaller>(
                hwSupport, border, edgeSharpness, scale, complexity, evolution);
}
