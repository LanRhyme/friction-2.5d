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

#include "propertybinding.h"

#include "Animators/complexanimator.h"

#include "Boxes/boundingbox.h"
#include "Boxes/cameralayer.h"
#include "canvas.h"

PropertyBinding::PropertyBinding(const Validator& validator,
                                 const Property* const context) :
    PropertyBindingBase(context),
    pathChanged([this]() {
        const auto oldBind = mBindProperty.get();
        updateBindPath();
        const auto newSource = sFindPropertyToBind(mPath, mValidator,
                                                   mContext.data());
        if(!newSource) setBindPathValid(false);
        else if(newSource != oldBind) bindProperty(mPath, newSource);
        else setBindPathValid(true);
    }), mValidator(validator) {
    connect(context, &Property::prp_pathChanged,
            this, [this]() { pathChanged(); });
}

#include "Animators/qrealanimator.h"
#include "Animators/qpointfanimator.h"

qsptr<PropertyBinding> PropertyBinding::sCreate(
        const QString& binding,
        const Validator& validator,
        const Property* const context) {
    const auto prop = sFindPropertyToBind(binding, validator, context);
    if(!prop) return nullptr;
    if(const auto qa = enve_cast<QrealAnimator*>(prop)) {
    } else if(const auto pa = enve_cast<QPointFAnimator*>(prop)) {
    } else return nullptr;
    const auto result = new PropertyBinding(validator, context);
    result->bindProperty(binding, prop);
    return qsptr<PropertyBinding>(result);
}

qsptr<PropertyBinding> PropertyBinding::sCreate(Property* const prop) {
    const auto result = new PropertyBinding(nullptr, nullptr);
    result->bindProperty("", prop);
    return qsptr<PropertyBinding>(result);
}

void PropertyBinding::setPath(const QString& path) {
    mPath = path;
    reloadBindProperty();
}

QJSValue PropertyBinding::getJSValue(QJSEngine& e) {
    if(mBindPathValid && mBindProperty)
        return mBindProperty->prp_getEffectiveJSValue(e);
    else return QJSValue::NullValue;
}

QJSValue PropertyBinding::getJSValue(QJSEngine& e, const qreal relFrame) {
    if(mBindPathValid && mBindProperty)
        return mBindProperty->prp_getEffectiveJSValue(e, relFrame);
    else return QJSValue::NullValue;
}

bool PropertyBinding::dependsOn(const Property* const prop) {
    if(!mBindProperty) return false;
    return mBindProperty == prop || mBindProperty->prp_dependsOn(prop);
}

FrameRange PropertyBinding::identicalRelRange(const int absFrame) {
    if(mBindPathValid && mBindProperty && mContext) {
        const int relFrame = mBindProperty->prp_absFrameToRelFrame(absFrame);
        const auto absRange = mBindProperty->prp_getIdenticalAbsRange(relFrame);
        return mContext->prp_absRangeToRelRange(absRange);
    }
    return FrameRange::EMINMAX;
}

FrameRange PropertyBinding::nextNonUnaryIdenticalRelRange(const int absFrame) {
    if(mBindPathValid && mBindProperty && mContext) {
        const int relFrame = mBindProperty->prp_absFrameToRelFrame(absFrame);
        const auto absRange = mBindProperty->prp_nextNonUnaryIdenticalAbsRange(relFrame);
        return mContext->prp_absRangeToRelRange(absRange);
    }
    return FrameRange::EMINMAX;
}

void PropertyBinding::reloadBindProperty() {
    const auto prop = sFindPropertyToBind(mPath, mValidator, mContext.data());
    bindProperty(mPath, prop);
}

Property *PropertyBinding::sFindPropertyToBind(const QString& binding,
                                               const Validator& validator,
                                               const Property* const context) {
    if(!context) return nullptr;
    const auto searchCtxt = context->getParent();
    if(!searchCtxt) return nullptr;
    const auto objs = binding.split('.');
    const auto found = searchCtxt->ca_findPropertyWithPathRec(0, objs);
    if(!found || found == context) return nullptr;
    if(found->prp_dependsOn(context)) return nullptr;
    if(validator && !validator(found)) return nullptr;
    return found;
}

void PropertyBinding::updateBindPath() {
    if(!mBindProperty || !mContext) return;
    QStringList prntPath;
    mContext->prp_getFullPath(prntPath);
    QStringList srcPath;
    mBindProperty->prp_getFullPath(srcPath);
    const int iMax = qMin(prntPath.count(), srcPath.count());
    for(int i = 0; i < iMax; i++) {
        const auto& iPrnt = prntPath.first();
        const auto& iSrc = srcPath.first();
        if(iPrnt == iSrc) {
            srcPath.removeFirst();
            prntPath.removeFirst();
        } else break;
    }
    mPath = srcPath.join('.');
}

bool PropertyBinding::bindProperty(const QString& path, Property * const newBinding) {
    if(newBinding && mValidator && !mValidator(newBinding)) return false;
    mPath = path;
    auto& conn = mBindProperty.assign(newBinding);
    if(newBinding) {
        setBindPathValid(true);
        conn << connect(newBinding, &Property::prp_absFrameRangeChanged,
                        this, [this](const FrameRange& absRange) {
            const auto relRange = mContext->prp_absRangeToRelRange(absRange);
            if(relRange.inRange(relFrame())) emit currentValueChanged();
            emit relRangeChanged(relRange);
        });
        connect(newBinding, &Property::prp_currentFrameChanged,
                this, &PropertyBinding::currentValueChanged);

        conn << connect(newBinding, &Property::prp_pathChanged,
                        this, [this]() { pathChanged(); });
    }
    emit currentValueChanged();
    emit relRangeChanged(FrameRange::EMINMAX);
    return true;
}

void PropertyBinding::setBindPathValid(const bool valid) {
    if(mBindPathValid == valid) return;
    mBindPathValid = valid;
    emit currentValueChanged();
    emit relRangeChanged(FrameRange::EMINMAX);
}

//---------------------------- CameraPropBinding ----------------------------

CameraPropBinding::CameraPropBinding(const Member member,
                                     const Property* const context) :
    PropertyBindingBase(context), mMember(member) {}

qsptr<CameraPropBinding> CameraPropBinding::sCreate(
        const Member member, const Property* const context) {
    const auto result = new CameraPropBinding(member, context);
    result->resolveSource();
    if(!result->mBind) return nullptr;
    return qsptr<CameraPropBinding>(result);
}

void CameraPropBinding::resolveSource() {
    const auto box = mContext ?
                mContext->getFirstAncestor<BoundingBox>() : nullptr;
    const auto scene = box ? box->getParentScene() : nullptr;
    const auto cam = scene ? scene->getCameraLayer() : nullptr;
    if(!cam) return;
    QrealAnimator* anim = nullptr;
    switch(mMember) {
        case Member::panX:  anim = cam->panXAnimator(); break;
        case Member::panY:  anim = cam->panYAnimator(); break;
        case Member::zoom:  anim = cam->zoomAnimator(); break;
        case Member::rotZ:  anim = cam->rotZAnimator(); break;
        case Member::focal: anim = cam->focalAnimator(); break;
    }
    if(!anim) return;
    auto& conn = mBind.assign(anim);
    // signal wiring mirrors PropertyBinding::bindProperty: range
    // changes drive the host animator's cache invalidation, the frame
    // signal re-evaluates on frame switches
    conn << connect(anim, &Property::prp_absFrameRangeChanged,
                    this, [this](const FrameRange& absRange) {
        const auto relRange = mContext->prp_absRangeToRelRange(absRange);
        if(relRange.inRange(relFrame())) emit currentValueChanged();
        emit relRangeChanged(relRange);
    });
    connect(anim, &Property::prp_currentFrameChanged,
            this, &CameraPropBinding::currentValueChanged);
    // camera deleted at runtime: bindings fall back to 0/1 instead of
    // dangling (the expressions degrade to the flat look)
    connect(cam, &QObject::destroyed, this, [this]() {
        emit currentValueChanged();
        emit relRangeChanged(FrameRange::EMINMAX);
    });
}

QJSValue CameraPropBinding::getJSValue(QJSEngine& e) {
    const auto anim = mBind.get();
    return anim ? anim->prp_getEffectiveJSValue(e) : QJSValue(0.);
}

QJSValue CameraPropBinding::getJSValue(QJSEngine& e, const qreal relFrame) {
    const auto anim = mBind.get();
    return anim ? anim->prp_getEffectiveJSValue(e, relFrame) : QJSValue(0.);
}

bool CameraPropBinding::dependsOn(const Property* const prop) {
    const auto anim = mBind.get();
    return anim && (anim == prop || anim->prp_dependsOn(prop));
}

bool CameraPropBinding::isValid() const { return mBind.get(); }

FrameRange CameraPropBinding::identicalRelRange(const int absFrame) {
    const auto anim = mBind.get();
    if(anim && mContext) {
        const int relFrame = anim->prp_absFrameToRelFrame(absFrame);
        const auto absRange = anim->prp_getIdenticalAbsRange(relFrame);
        return mContext->prp_absRangeToRelRange(absRange);
    }
    return FrameRange::EMINMAX;
}

FrameRange CameraPropBinding::nextNonUnaryIdenticalRelRange(
        const int absFrame) {
    const auto anim = mBind.get();
    if(anim && mContext) {
        const int relFrame = anim->prp_absFrameToRelFrame(absFrame);
        const auto absRange =
                anim->prp_nextNonUnaryIdenticalAbsRange(relFrame);
        return mContext->prp_absRangeToRelRange(absRange);
    }
    return FrameRange::EMINMAX;
}

QString CameraPropBinding::path() const {
    switch(mMember) {
        case Member::panX:  return QStringLiteral("$camera().panX");
        case Member::panY:  return QStringLiteral("$camera().panY");
        case Member::zoom:  return QStringLiteral("$camera().zoom");
        case Member::rotZ:  return QStringLiteral("$camera().rotZ");
        case Member::focal: return QStringLiteral("$camera().focal");
    }
    return QStringLiteral("$camera().zoom");
}
