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

// Dev-only: headless canvas point hit-test reproduction for the
// "ghost anchor" report (map line generator). Mirrors the mapLine.js
// layer structure (group + dashed center + referenced outline) and
// queries the exact production hit-test path used by canvas hover:
// BoundingBox::getPointAtAbsPos / Canvas::getPointAtAbsPos.

#ifndef HITTESTDEBUG_H
#define HITTESTDEBUG_H

#include "core_global.h"

CORE_EXPORT bool mapLineHitTestDebug();

#endif // HITTESTDEBUG_H
