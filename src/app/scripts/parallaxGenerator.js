// parallaxGenerator.js — 视差生成器（AE CEP "Parallaxer" 移植）
//
// 一键搭建 2.5D 视差场景：内容层沿 Z 轴分布 + 每层挂补偿表达式。
// 相机直接用 Friction 原生摄像机图层：动画摄像机的 平移X/Y 与 缩放
// （=推拉）即产生真实景深视差（近层动得多、远层动得少）。
//
// 原理：Friction 相机本身是画布级统一变换（无视差），每层表达式
// 负责 ① 抵消统一变换 ② 按本层 Z 深度做针孔投影。默认相机参数下
// 画面与原始平铺完全一致。旋转/倾斜未做抵消——视差模式请只用
// 平移与缩放操作相机。
(function () {
    var debugLog = [];
    function log(msg) {
        debugLog.push(msg);
        if (debugLog.length > 300) debugLog.shift();
        try { print(msg); } catch (e) {}
    }

    var WARN_TEXT = "视差已激活 - 完成后请烘焙";
    // 旧版控制器方案的空对象层名（AE 原版同款 "- CAM CTRL -" 机制
    // 已弃用：Friction 版直接动画原生摄像机，无父级绑定）
    var LEGACY_CTRL_NAME = "CAM CTRL";

    // AE 原版校准常量（按 1920x1080 标定，随画布比例缩放）
    var CAM_ZOOM = 1493.3;
    var SIZE_DIV = 4820;
    var Z_START = 35;
    var Z_END = 4285;

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

    // 旧版（控制器方案）残留的 CAM CTRL 空对象层：应用视差时
    // 自动删除——原生摄像机方案不需要任何父级空对象
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

    function sizeFactor(scene) {
        return (scene.width + scene.height) / SIZE_DIV;
    }

    // ---- 每层补偿表达式 -------------------------------------------------
    // 绑定：$value(基值)/$scene/本层 Z 与透视/$camera().panX/.panY/.zoom
    // 铁律：必须绑 frame=$frame（否则换帧冻结）；常量烤进 script 体
    //
    // Friction 相机统一变换 cam(q) = C + zoom*(q - C - pan)，
    // 针孔投影（zoom 解释为推近倍率，相机距离 d = Z0/zoom）：
    //   X = C + k*(L - C - pan)，k = Z0*zoom/(Z0 + z*zoom)
    // 抵消 + 投影（令 t = Z0/(Z0 + z*zoom)，u = 层中心偏画布中心）：
    //   新位置 = v + pan + t*((Z0+z)/Z0*u - pan) - u
    //   新缩放 = s * (Z0+z)/(Z0 + z*zoom) * (f+z)/f   ← 末项抵消 billboard
    // 默认（pan=0, zoom=1）：t*(Z0+z)/Z0 = 1，位置/缩放还原原画面
    function bindLayer(layer, Z0, cX, cY, sw, sh) {
        var z0Lit = Z0.toFixed(2);

        var posBindingsX =
            "frame = $frame;\n" +
            "v = $value;\n" +
            "sw = $scene.width;\n" +
            "z = transform.3D position Z;\n" +
            "px = $camera().panX;\n" +
            "zm = $camera().zoom;\n";
        var posBindingsY =
            "frame = $frame;\n" +
            "v = $value;\n" +
            "sh = $scene.height;\n" +
            "z = transform.3D position Z;\n" +
            "py = $camera().panY;\n" +
            "zm = $camera().zoom;\n";

        var err = layer.property("positionx").setExpression(
            posBindingsX,
            "var u = v + " + cX.toFixed(2) + " - sw/2;\n" +
            "var t = " + z0Lit + "/(" + z0Lit + " + z*zm);\n" +
            "return v + px + t*((" + z0Lit + " + z)/" + z0Lit + "*u - px) - u;");
        if (err) { return "位置X: " + err; }

        err = layer.property("positiony").setExpression(
            posBindingsY,
            "var u = v + " + cY.toFixed(2) + " - sh/2;\n" +
            "var t = " + z0Lit + "/(" + z0Lit + " + z*zm);\n" +
            "return v + py + t*((" + z0Lit + " + z)/" + z0Lit + "*u - py) - u;");
        if (err) { return "位置Y: " + err; }

        var scaleBindings =
            "frame = $frame;\n" +
            "s = $value;\n" +
            "z = transform.3D position Z;\n" +
            "f = transform.3D perspective;\n" +
            "zm = $camera().zoom;\n";
        var scaleScript =
            "return s*(" + z0Lit + " + z)/(" + z0Lit + " + z*zm)*(f + z)/f;";

        err = layer.property("scalex").setExpression(scaleBindings, scaleScript);
        if (err) { return "缩放X: " + err; }
        err = layer.property("scaley").setExpression(scaleBindings, scaleScript);
        if (err) { return "缩放Y: " + err; }
        return "";
    }

    // ---- 1. 应用视差 ----------------------------------------------------
    function doSetup() {
        var scene = getScene();
        if (!scene) { return; }

        var layers = contentLayers(scene);
        if (layers.length === 0) { alert("场景中没有可处理的图层。"); return; }

        // 已应用检测：任一内容层位置带表达式
        var applied = false;
        for (var i = 0; i < layers.length; i++) {
            if (layers[i].property("positionx").hasExpression()) {
                applied = true; break;
            }
        }
        if (applied) {
            alert("视差生成器已应用于此场景。\n如需重新生成，请先「烘焙」。");
            return;
        }

        var sf = sizeFactor(scene);
        var Z0 = +(CAM_ZOOM * sf).toFixed(2);
        var zStart = Z_START * sf;
        var zEnd = Z_END * sf;

        app.beginUndoGroup("应用视差");
        try {
            // 清理旧版残留的控制器空对象
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
            var errs = [];
            for (var i = 0; i < n; i++) {
                var L = layers[i];
                // 3D 开关必须先开：3D 子轴 SWT 可见后表达式绑定才能解析
                if (!L.is3DEnabled()) { L.set3DEnabled(true); }

                // AE 版分布：顶层(索引0=最前景)拿最小 z
                var z = zStart + (zEnd - zStart) * i / Math.max(n - 1, 1);
                L.zPosition().setValue(+z.toFixed(2));

                // 轴心归一到内容中心（billboard 缩放中心 = 投影参考点）
                var cX = 0, cY = 0;
                var b = L.bounds();
                if (b && isFinite(b.width) && isFinite(b.height)) {
                    cX = b.left + b.width / 2;
                    cY = b.top + b.height / 2;
                    L.setAnchorPoint([cX, cY]);
                }

                var err = bindLayer(L, Z0, cX, cY, scene.width, scene.height);
                if (err) { errs.push("[" + L.name + "] " + err); }
                log("已设置: " + L.name + "  z=" + z.toFixed(1) +
                    "  轴心=(" + cX.toFixed(0) + "," + cY.toFixed(0) + ")" +
                    (err ? "  表达式错误: " + err : ""));
            }

            // 警告层（AE 版同款提示）
            var warn = scene.addText(WARN_TEXT, WARN_TEXT);
            if (warn) {
                warn.position().setValue(
                    [scene.width / 2, (scene.width + scene.height) / 60]);
            }

            // 静默成功：不打扰，结果进日志
            log("应用视差完成: 层数=" + n + " 相机=" +
                (camCreated ? "新建" : "沿用现有") +
                " Z0=" + Z0 + " z=" + zStart.toFixed(1) + "→" + zEnd.toFixed(1));

            if (errs.length > 0) {
                alert("应用完成，但 " + errs.length + " 个图层表达式失败：\n" +
                      errs.join("\n"));
            }
        } catch (e) {
            alert("应用视差出错: " + e);
            log("setup 异常: " + e);
        } finally {
            app.endUndoGroup();
        }
    }

    // ---- 2. 间距调节（AE 版：围绕中位面 Z 缩放，直接数学实现） -----------
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

    // ---- 5. 烘焙 --------------------------------------------------------
    // AE 版语义：删警告层 + 重置相机 + 表达式值固化 + 删全部键。
    // Friction 要点：
    // - 相机 pan/zoom/rotZ 的关键帧必须清掉：表达式删除后相机的
    //   统一变换仍会作用于全部层，残留动画会污染静态画面
    // - 位置表达式在默认相机下输出=基值，clearExpression 即还原
    // - 缩放固化 s*(f+z)/f：zPos 保留时 billboard 透视仍在，固化值
    //   内含抵消因子，画面严格保持 flat 原样
    function doBake() {
        var scene = getScene();
        if (!scene) { return; }
        // 旧版（控制器方案）场景可能没有摄像机：跳过相机清理，
        // 照常固化图层（兼容旧工程迁移）
        var cam = findCamera(scene);

        app.beginUndoGroup("烘焙");
        try {
            var warn = findWarningLayer(scene);
            if (warn) { warn.remove(); }
            removeLegacyCtrl(scene);

            // 清相机动画 + 归零（统一变换必须消失）
            if (cam) {
                var keys = ["panX", "panY", "zoom", "rotZ"];
                for (var k = 0; k < keys.length; k++) {
                    var cp = cam.cameraProperty(keys[k]);
                    while (cp.numKeys > 0) { cp.removeKeyAtFrame(cp.keyFrame(1)); }
                }
                resetCamera(cam);
            }

            var layers = contentLayers(scene);
            var done = 0;
            for (var i = 0; i < layers.length; i++) {
                var L = layers[i];
                try {
                    var z = L.zPosition().value;
                    var f = L.perspective().value;
                    if (!isFinite(f) || f < 1) { f = 800; }
                    var comp = (f + z) / f;

                    var sx = L.property("scalex");
                    var sy = L.property("scaley");
                    if (sx.hasExpression()) {
                        var sv = sx.value * comp;
                        sx.clearExpression();
                        sx.setValue(+sv.toFixed(4));
                    }
                    if (sy.hasExpression()) {
                        var sv2 = sy.value * comp;
                        sy.clearExpression();
                        sy.setValue(+sv2.toFixed(4));
                    }
                    var px = L.property("positionx");
                    var py = L.property("positiony");
                    if (px.hasExpression()) { px.clearExpression(); }
                    if (py.hasExpression()) { py.clearExpression(); }
                    done++;
                    log("已烘焙: " + L.name + " z=" + z.toFixed(1) +
                        " 缩放补偿=" + comp.toFixed(3));
                } catch (e) {
                    log("烘焙失败 [" + L.name + "]: " + e);
                }
            }

            // 取消全部选中（AE 版行为）
            var ls2 = scene.layers();
            for (var i = 0; i < ls2.length; i++) { ls2[i].selected = false; }

            log("烘焙完成: " + done + "/" + layers.length + " 层");
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
            { label: "重置相机", tooltip: "相机平移/缩放归零（画面=原始平铺）",
              onClick: doResetCamera },
            { label: "烘焙", tooltip: "移除表达式与相机动画，固化画面",
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
