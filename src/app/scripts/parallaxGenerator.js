// parallaxGenerator.js — 视差生成器（AE CEP "Parallaxer" 移植）
//
// 一键搭建 2.5D 视差场景：内容层沿 Z 轴分布 + 场景摄像机。
// 视差由引擎逐层相机矩阵直接渲染（Parallaxer 语义）：
// - 相机在默认位置时，画面与原始平铺完全一致（图层大小不变）
// - 相机平移 / 推拉（缩放）/ 轨道旋转时，各层按自身 Z 深度
//   错开 —— 近层动得多、远层动得少，旋转也错层
//
// 相机操作：摄像机工具下 Shift+左键=平移、Ctrl+左键=推拉、
// 左键=轨道旋转，或在时间线 K 摄像机图层的动画器关键帧。
(function () {
    var debugLog = [];
    function log(msg) {
        debugLog.push(msg);
        if (debugLog.length > 300) debugLog.shift();
        try { print(msg); } catch (e) {}
    }

    var WARN_TEXT = "视差已激活 - 完成后请烘焙";
    // 旧版控制器方案的空对象层名（已弃用：视差由引擎相机直接渲染）
    var LEGACY_CTRL_NAME = "CAM CTRL";

    // AE 原版校准常量（按 1920x1080 标定，随画布比例缩放）
    var Z_START = 35;
    var Z_END = 4285;
    var SIZE_DIV = 4820;

    function getScene() {
        var scene = app.activeScene;
        if (!scene) { alert("请先打开一个场景。"); return null; }
        return scene;
    }

    function isSystemLayer(layer) {
        return layer.isCamera() ||
               layer.name === LEGACY_CTRL_NAME ||
               layer.name === WARN_TEXT ||
               layer.name.indexOf("视差已激活") === 0;
    }

    function findCamera(scene) {
        var ls = scene.layers();
        for (var i = 0; i < ls.length; i++) {
            if (ls[i].isCamera()) { return ls[i]; }
        }
        return null;
    }

    function findWarningLayer(scene) {
        var ls = scene.layers();
        for (var i = 0; i < ls.length; i++) {
            if (ls[i].name === WARN_TEXT ||
                ls[i].name.indexOf("视差已激活") === 0) {
                return ls[i];
            }
        }
        return null;
    }

    // 顶层内容层（排除摄像机与警告层）；AE 原版同样只处理顶层图层
    function contentLayers(scene) {
        var ls = scene.layers();
        var out = [];
        for (var i = 0; i < ls.length; i++) {
            if (!isSystemLayer(ls[i])) { out.push(ls[i]); }
        }
        return out;
    }

    // 旧版残留的控制器空对象：自动删除
    function removeLegacyCtrl(scene) {
        var ls = scene.layers();
        for (var i = 0; i < ls.length; i++) {
            if (ls[i].name === LEGACY_CTRL_NAME) {
                ls[i].remove();
                log("已删除旧版残留的控制器层: " + LEGACY_CTRL_NAME);
                return true;
            }
        }
        return false;
    }

    // ---- 1. 应用视差 ----------------------------------------------------
    function doSetup() {
        var scene = getScene();
        if (!scene) { return; }

        if (findWarningLayer(scene)) {
            alert("视差生成器已应用于此场景。\n如需重新生成，请先「烘焙」。");
            return;
        }

        var layers = contentLayers(scene);
        if (layers.length === 0) { alert("场景中没有可处理的图层。"); return; }

        var sf = (scene.width + scene.height) / SIZE_DIV;
        var zStart = Z_START * sf;
        var zEnd = Z_END * sf;

        app.beginUndoGroup("应用视差");
        try {
            removeLegacyCtrl(scene);

            // 相机：直接用/建 Friction 原生摄像机图层
            var cam = findCamera(scene);
            var camCreated = false;
            if (!cam) {
                cam = scene.addCamera("摄像机");
                camCreated = !!cam;
            }
            if (!cam) { throw "无法创建摄像机图层"; }

            var n = layers.length;
            for (var i = 0; i < n; i++) {
                var L = layers[i];
                // 3D 开关打开后 zPos 才参与相机投影
                if (!L.is3DEnabled()) { L.set3DEnabled(true); }
                // AE 版分布：顶层(索引0=最前景)拿最小 z
                var z = zStart + (zEnd - zStart) * i / Math.max(n - 1, 1);
                L.zPosition().setValue(+z.toFixed(2));
                log("已设置: " + L.name + "  z=" + z.toFixed(1));
            }

            // 警告层（AE 版同款提示）
            var warn = scene.addText(WARN_TEXT, WARN_TEXT);
            if (warn) {
                warn.position().setValue(
                    [scene.width / 2, (scene.width + scene.height) / 60]);
            }

            // 静默成功：结果进日志
            log("应用视差完成: 层数=" + n + " 相机=" +
                (camCreated ? "新建" : "沿用现有") +
                " z=" + zStart.toFixed(1) + "→" + zEnd.toFixed(1));
        } catch (e) {
            alert("应用视差出错: " + e);
            log("setup 异常: " + e);
        } finally {
            app.endUndoGroup();
        }
    }

    // ---- 2. 间距调节（AE 版：围绕中位面 Z 缩放） -------------------------
    function adjustSpacing(factor, label) {
        var scene = getScene();
        if (!scene) { return; }
        var sel = scene.selectedLayers();
        var valid = [];
        for (var i = 0; i < sel.length; i++) {
            if (!isSystemLayer(sel[i])) { valid.push(sel[i]); }
        }
        if (valid.length < 2) {
            alert("请至少选择两个图层（" + label + "）。");
            return;
        }

        var zs = [];
        var sum = 0;
        for (var i = 0; i < valid.length; i++) {
            var z = valid[i].zPosition().value;
            zs.push(z);
            sum += z;
        }
        var zc = sum / valid.length;

        app.beginUndoGroup(label);
        try {
            for (var i = 0; i < valid.length; i++) {
                valid[i].zPosition().setValue(
                    +(zc + (zs[i] - zc) * factor).toFixed(2));
            }
            log(label + ": 基准面 z=" + zc.toFixed(1) +
                " 系数=" + factor + " 层数=" + valid.length);
        } catch (e) {
            alert("出错: " + e);
            log(label + " 异常: " + e);
        } finally {
            app.endUndoGroup();
        }
    }

    // ---- 3. 批量 3D 开关 ------------------------------------------------
    function set3DBatch(enabled) {
        var scene = getScene();
        if (!scene) { return; }
        var sel = scene.selectedLayers();
        if (!sel || sel.length === 0) {
            alert("请先选中一个或多个图层。");
            return;
        }
        app.beginUndoGroup(enabled ? "打开 3D" : "关闭 3D");
        try {
            var n = 0;
            for (var i = 0; i < sel.length; i++) {
                if (sel[i].is3DEnabled() !== enabled) {
                    sel[i].set3DEnabled(enabled);
                }
                n++;
            }
            log((enabled ? "已打开 3D: " : "已关闭 3D: ") + n + " 个图层");
        } catch (e) {
            alert("出错: " + e);
            log("3D 开关异常: " + e);
        } finally {
            app.endUndoGroup();
        }
    }

    // ---- 4. 重置相机 ----------------------------------------------------
    function resetCamera(cam) {
        cam.cameraProperty("panX").setValue(0);
        cam.cameraProperty("panY").setValue(0);
        cam.cameraProperty("zoom").setValue(1);
        cam.cameraProperty("rotZ").setValue(0);
    }

    function doResetCamera() {
        var scene = getScene();
        if (!scene) { return; }
        var cam = findCamera(scene);
        if (!cam) {
            alert("未找到摄像机图层，请先点「应用视差」。");
            return;
        }
        app.beginUndoGroup("重置相机");
        try {
            resetCamera(cam);
            log("相机已重置（平移 0,0 缩放 1）");
        } catch (e) {
            alert("出错: " + e);
            log("重置相机异常: " + e);
        } finally {
            app.endUndoGroup();
        }
    }

    // ---- 5. 预览视差 ----------------------------------------------------
    // 默认视角画面=原始平铺（设计行为），一键推近 25% 立见层次效果
    var previewOn = false;
    function togglePreview() {
        var scene = getScene();
        if (!scene) { return; }
        var cam = findCamera(scene);
        if (!cam) {
            alert("未找到摄像机图层，请先点「应用视差」。");
            return;
        }
        app.beginUndoGroup(previewOn ? "结束视差预览" : "预览视差");
        try {
            if (!previewOn) {
                cam.cameraProperty("zoom").setValue(1.25);
                previewOn = true;
                log("预览视差已开启（推近 25%）：近景层放大明显、远景层几乎不动；" +
                    "再点一次恢复");
            } else {
                resetCamera(cam);
                previewOn = false;
                log("视差预览已恢复（相机归零）");
            }
        } catch (e) {
            alert("出错: " + e);
            log("预览异常: " + e);
        } finally {
            app.endUndoGroup();
        }
    }

    // ---- 6. 烘焙 --------------------------------------------------------
    // AE 版语义：删警告层 + 重置相机 + 清相机动画关键帧。
    // 图层保持 3D 与 Z 分布（AE 同款，之后仍可继续用相机运镜）。
    function doBake() {
        var scene = getScene();
        if (!scene) { return; }
        var cam = findCamera(scene);

        app.beginUndoGroup("烘焙");
        try {
            var warn = findWarningLayer(scene);
            if (warn) { warn.remove(); }
            removeLegacyCtrl(scene);

            // 清相机动画 + 归零
            if (cam) {
                var keys = ["panX", "panY", "zoom", "rotZ"];
                for (var k = 0; k < keys.length; k++) {
                    var cp = cam.cameraProperty(keys[k]);
                    while (cp.numKeys > 0) { cp.removeKeyAtFrame(cp.keyFrame(1)); }
                }
                resetCamera(cam);
            }

            // 取消全部选中（AE 版行为）
            var ls2 = scene.layers();
            for (var i = 0; i < ls2.length; i++) { ls2[i].selected = false; }

            log("烘焙完成（相机动画已清除）");
        } catch (e) {
            alert("出错: " + e);
            log("bake 异常: " + e);
        } finally {
            app.endUndoGroup();
        }
    }

    // ---- 面板 -----------------------------------------------------------
    registerPanel({
        title: "视差生成器",
        columns: 3,
        buttons: [
            { label: "间距−", tooltip: "缩小所选图层之间的 Z 轴距离（85%）",
              onClick: function () { adjustSpacing(0.85, "缩小间距"); } },
            { label: "间距+", tooltip: "增大所选图层之间的 Z 轴距离（115%）",
              onClick: function () { adjustSpacing(1.15, "增大间距"); } },
            { label: "展平", tooltip: "将所选图层放到 Z 轴同一平面",
              onClick: function () { adjustSpacing(0.001, "展平图层"); } },
            { label: "3D开", tooltip: "打开所选图层的 3D 开关（批量）",
              onClick: function () { set3DBatch(true); } },
            { label: "3D关", tooltip: "关闭所选图层的 3D 开关（批量）",
              onClick: function () { set3DBatch(false); } },
            { label: "预览视差", tooltip: "相机推近 25% 立即查看层次效果（再点恢复）。默认视角画面=原始平铺，深度只在相机变化时显现",
              onClick: togglePreview },
            { label: "重置相机", tooltip: "相机平移/缩放/旋转归零（画面=原始平铺）",
              onClick: doResetCamera },
            { label: "烘焙", tooltip: "删除提示层并清除相机动画关键帧（图层保持 3D 深度）",
              onClick: doBake }
        ],
        extraButtons: [
            { label: "应用视差", tooltip: "Z 轴分布全部图层 + 建立视差相机（静默执行）",
              onClick: doSetup },
            { label: "☰ 调试日志", tooltip: "查看并复制调试日志",
              onClick: function () {
                  alert(debugLog.length > 0 ? debugLog.join("\n") : "暂无日志");
              } }
        ]
    });
})();
