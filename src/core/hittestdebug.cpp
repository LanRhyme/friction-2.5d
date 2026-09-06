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
# This program is distributed without any warranty of any kind.
# See 'README.md' for more information.
#
*/

#include "hittestdebug.h"

#include <QDebug>
#include <QDir>

#include "Private/esettings.h"
#include "Private/document.h"
#include "Private/Tasks/taskscheduler.h"
#include "efiltersettings.h"
#include "Boxes/smartvectorpath.h"
#include "Boxes/containerbox.h"
#include "MovablePoints/smartnodepoint.h"
#include "MovablePoints/pointshandler.h"
#include "Animators/SmartPath/smartpathanimator.h"
#include "simpletask.h"
#include "canvas.h"

#define HT_BCRUMB(what) \
    { fprintf(stderr, "[HIT-TEST] %s\n", what); fflush(stderr); }

bool mapLineHitTestDebug()
{
    HT_BCRUMB("enter")
    // console test env: the app normally creates these singletons
    if (!eSettings::sInstance) {
        const auto settings = new eSettings(4, intKB(8*1024*1024));
        Q_UNUSED(settings)
    }
    if (!Document::sInstance) {
        static TaskScheduler taskScheduler;
        static Document document(taskScheduler);
        Q_UNUSED(document)
    }
    if (!eFilterSettings::sInstance) {
        static eFilterSettings filterSettings;
        Q_UNUSED(filterSettings)
    }
    HT_BCRUMB("env ready")

    // BISECT: probe createNewScene immediately after the singletons -
    // if this crashes the headless env setup itself is the culprit,
    // not the map-line layer structure
    if (qEnvironmentVariableIsSet("HT_ENV_SCENE")) {
        HT_BCRUMB("env-scene probe begin")
        const auto envScene = Document::sInstance->createNewScene();
        HT_BCRUMB(envScene ? "env-scene OK" : "env-scene NULL")
    }

    // mirror mapLine.js: 10-node open polyline (straight segments,
    // zero-length tangents - exactly what addPath produces for a
    // hand-drawn path)
    SkPath path;
    path.moveTo(100, 100);
    const QPointF nodes[9] = {
        {220, 160}, {340, 100}, {460, 200}, {580, 120}, {700, 180},
        {820, 100}, {940, 160}, {1060, 110}, {1180, 150}
    };
    for (const auto& n : nodes) {
        path.lineTo(SkScalar(n.x()), SkScalar(n.y()));
    }
    HT_BCRUMB("path built")

    auto report = [](const char* tag, MovablePoint* pt) {
        fprintf(stderr, "[HIT-TEST] %s -> %s\n",
                tag, pt ? "HIT" : "NULL");
        fflush(stderr);
    };

    // --- case A: bare path layer (no group), like selecting the
    // center-line layer directly
    HT_BCRUMB("case A begin")
    auto center = enve::make_shared<SmartVectorPath>();
    center->loadSkPath(path);
    const QPointF probe(100, 100); // first node
    HT_BCRUMB("A probes")
    report("A1 bare-layer first-node",
           center->getPointAtAbsPos(probe, CanvasMode::pointTransform, 1.0));
    report("A2 bare-layer mid-node",
           center->getPointAtAbsPos(nodes[3], CanvasMode::pointTransform, 1.0));
    report("A3 bare-layer off-path",
           center->getPointAtAbsPos(QPointF(50, 50),
                                    CanvasMode::pointTransform, 1.0));

    // BISECT: probe createNewScene right after case A to tell
    // whether the heap is already corrupt (A/loadSkPath) or gets
    // corrupted by case B (group assembly)
    if (qEnvironmentVariableIsSet("HT_EARLY_SCENE")) {
        HT_BCRUMB("early-scene probe begin")
        const auto early = Document::sInstance->createNewScene();
        HT_BCRUMB(early ? "early-scene OK" : "early-scene NULL")
    }

    // --- case B: group holding the layer, like the generated
    // "map line" group (selection lands on the group)
    HT_BCRUMB("case B begin")
    auto group = enve::make_shared<ContainerBox>(eBoxType::group);
    group->addContained(center);
    HT_BCRUMB("B group built")
    report("B1 group first-node",
           group->getPointAtAbsPos(probe, CanvasMode::pointTransform, 1.0));
    HT_BCRUMB("B1 done")
    report("B2 group mid-node",
           group->getPointAtAbsPos(nodes[3], CanvasMode::pointTransform, 1.0));
    HT_BCRUMB("B2 done")
    // B3: the layer is INSIDE the group but selected directly (the
    // way the user works: click the child layer to edit its nodes) -
    // this is the real map-line scenario
    report("B3 in-group layer first-node",
           center->getPointAtAbsPos(probe, CanvasMode::pointTransform, 1.0));
    HT_BCRUMB("B3 done")

    // --- case C: second layer whose local path is EMPTY but which
    // references the first (the outline layer). It must contribute
    // no points, but also must not break the group hit-test.
    // BISECT: skip the setPathSource wiring to isolate the heap
    // corruption source (C wiring vs B group assembly).
    const bool runCaseC = qEnvironmentVariableIsSet("HT_RUN_C");
    if (runCaseC) {
        HT_BCRUMB("case C begin")
        auto outline = enve::make_shared<SmartVectorPath>();
        outline->setPathSource(center.get());
        {
            const auto offsetAnim = outline->getPathSourceOffset();
            if (offsetAnim) {
                offsetAnim->prp_startTransform();
                offsetAnim->setCurrentBaseValue(13.0);
                offsetAnim->prp_finishTransform();
            }
        }
        group->addContained(outline);
        report("C1 outline-layer own-node",
               outline->getPointAtAbsPos(probe, CanvasMode::pointTransform, 1.0));
        report("C2 group-with-ref first-node",
               group->getPointAtAbsPos(probe, CanvasMode::pointTransform, 1.0));
    } else {
        HT_BCRUMB("case C SKIPPED (HT_RUN_C not set)")
    }

    // --- case E: anchor VALIDITY - rebuild the full map-line layer
    // structure (center line + outline layer whose local path is
    // emptied by the path-source link), then drag the first node the
    // way a canvas node drag does. A dead anchor leaves the path
    // data unchanged; a live anchor moves it. Gated behind HT_RUN_E
    // so a headless crash in the transform flow cannot take down the
    // rest of the matrix.
    if (qEnvironmentVariableIsSet("HT_RUN_E")) {
        HT_BCRUMB("case E begin")
        auto center2 = enve::make_shared<SmartVectorPath>();
        center2->loadSkPath(path);
        auto outline2 = enve::make_shared<SmartVectorPath>();
        outline2->loadSkPath(path);
        outline2->setPathSource(center2.get());
        HT_BCRUMB("E structure built")

        // E1: point inventory. the outline's local nodes must be gone
        // (setPathToEmpty); the center keeps all of them
        const auto centerColl = center2->getPathAnimator();
        const auto outlineColl = outline2->getPathAnimator();
        auto centerChild = centerColl
                ? centerColl->ca_getChildAt<SmartPathAnimator>(0) : nullptr;
        auto outlineChild = outlineColl
                ? outlineColl->ca_getChildAt<SmartPathAnimator>(0) : nullptr;
        const auto centerHandler = centerChild
                ? centerChild->getPointsHandler() : nullptr;
        const auto outlineHandler = outlineChild
                ? outlineChild->getPointsHandler() : nullptr;
        fprintf(stderr, "[HIT-TEST] E1 inventory center nodes=%d outline nodes=%d\n",
                centerHandler ? centerHandler->count() : -1,
                outlineHandler ? outlineHandler->count() : -1);
        fflush(stderr);

        // E2: drag the center's first node 40/25 px and see whether
        // the path data follows (this is what "useless anchor" means
        // when the user drags one: data does not move)
        auto dragPt = centerHandler
                ? centerHandler->getPointWithId<SmartNodePoint>(0) : nullptr;
        const SkPoint beforePt = center2->getRelativePath(0).getPoint(0);
        if (dragPt) {
            dragPt->startTransform();
            dragPt->setAbsolutePos(QPointF(140, 125));
            dragPt->finishTransform();
        }
        const SkPoint afterPt = center2->getRelativePath(0).getPoint(0);
        const bool moved = qAbs(afterPt.x() - beforePt.x()) > 1.f ||
                           qAbs(afterPt.y() - beforePt.y()) > 1.f;
        fprintf(stderr, "[HIT-TEST] E2 node-drag (%.1f,%.1f) -> (%.1f,%.1f) : %s\n",
                beforePt.x(), beforePt.y(), afterPt.x(), afterPt.y(),
                dragPt ? (moved ? "LIVE (data moved)" : "DEAD (data unchanged)")
                       : "no drag point");
        fflush(stderr);

        // E3: the outline (linked geometry) must reflect the dragged
        // center immediately at the data level
        const SkPoint followPt = outline2->getRelativePath(0).getPoint(0);
        fprintf(stderr, "[HIT-TEST] E3 outline follow (%.1f,%.1f) expected (140.0,125.0) : %s\n",
                followPt.x(), followPt.y(),
                (qAbs(followPt.x() - 140.f) < 1.f &&
                 qAbs(followPt.y() - 125.f) < 1.f)
                    ? "FOLLOWED" : "STALE");
        fflush(stderr);

        // E4: the outline must expose no draggable node of its own
        report("E4 outline own-node target",
               outlineHandler
                   ? outlineHandler->getPointWithId<SmartNodePoint>(0) : nullptr);

        // E5: repaint wiring - dragging the center must notify the
        // outline (the linked layer refreshes through the source
        // collection's prp_currentFrameChanged, the only signal the
        // path-source link connects). Count signals fired by a
        // SECOND drag so the connect is the production one.
        int frameSigs = 0;
        if (centerColl) {
            QObject::connect(centerColl, &Property::prp_currentFrameChanged,
                             [&frameSigs](UpdateReason) { frameSigs++; });
        }
        auto dragPt2 = centerHandler
                ? centerHandler->getPointWithId<SmartNodePoint>(1) : nullptr;
        if (dragPt2) {
            dragPt2->startTransform();
            dragPt2->setAbsolutePos(QPointF(300, 200));
            dragPt2->finishTransform();
        }
        // the drag notifies through SimpleTaskScheduler (deferred);
        // flush the queue the way the GUI event loop would
        SimpleTask::sProcessAll();
        fprintf(stderr, "[HIT-TEST] E5 drag signals frame=%d : %s\n",
                frameSigs,
                (frameSigs > 0)
                    ? "NOTIFIED (linked layer repaints)" : "SILENT (stale until frame change)");
        fflush(stderr);

        outline2->removeFromParent_k();
        center2->removeFromParent_k();
        HT_BCRUMB("E done")
    } else {
        HT_BCRUMB("case E SKIPPED (HT_RUN_E not set)")
    }

    // --- case D: full canvas-level path (what hover actually calls).
    // Canvas doubles as the scene; put the group inside and drive the
    // document selection the way clicking does.
    HT_BCRUMB("case D begin")
    Canvas* canvas = Document::sInstance->createNewScene();
    HT_BCRUMB("D scene created")
    if (canvas) {
        canvas->addContained(group);
        HT_BCRUMB("D group added")
        Document::sInstance->setCanvasMode(CanvasMode::pointTransform);
        HT_BCRUMB("D mode set")
        group->setSelected(false);
        HT_BCRUMB("D deselected")
        group->setSelected(true); // enter the document selection set
        HT_BCRUMB("D selected")
        report("D1 canvas group first-node",
               canvas->getPointAtAbsPos(probe, CanvasMode::pointTransform, 1.0));
        HT_BCRUMB("D1 done")
        report("D2 canvas group mid-node",
               canvas->getPointAtAbsPos(nodes[3], CanvasMode::pointTransform, 1.0));
        HT_BCRUMB("D2 done")
        group->setSelected(false);
        HT_BCRUMB("D group deselected")
        center->setSelected(true);
        HT_BCRUMB("D layer selected")
        report("D3 canvas bare-layer first-node",
               canvas->getPointAtAbsPos(probe, CanvasMode::pointTransform, 1.0));
        HT_BCRUMB("D3 done")
        center->setSelected(false);
    } else {
        HT_BCRUMB("createNewScene failed - D skipped")
    }

    // cleanup so repeated runs in one process stay consistent
    group->removeFromParent_k();
    HT_BCRUMB("done")
    return true;
}
