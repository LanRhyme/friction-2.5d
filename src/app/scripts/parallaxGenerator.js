// parallaxGenerator.js — 视差生成器（AE CEP "Parallaxer" 移植）
//
// 一键搭建 2.5D 视差场景：内容层沿 Z 轴分布 + 每层挂补偿表达式。
// 默认视角下画面与原始完全一致；动画「CAM CTRL」控制器属性即产生
// 真实景深视差（近层动得多、远层动得少，推拉时近层放得快）。
//
// 与 AE 原版（Cream-FX Parallaxer）的差异：
// - Friction 相机是画布级统一 2D 变换（无逐层投影），视差由每层
//   表达式显式完成针孔投影，相机参数放在控制器层的自定义属性上
// - 相机参数：相机X / 相机Y（平移）、相机距离（推拉 dolly）、焦距
//   （默认 1493.3×画布比例，对应 AE 的 Zoom=1493.3）
// - 图层深度用原生「3D position Z」，可在时间线上单独 K 帧
(function () {
    var debugLog = [];
    function log(msg) {
        debugLog.push(msg);
        if (debugLog.length > 300) debugLog.shift();
        try { print(msg); } catch (e) {}
    }

    var CTRL_NAME = "CAM CTRL";
    var WARN_TEXT = "视差已激活 - 完成后请烘焙";

    // AE 原版校准常量（按 1920x1080 标定，随画布对角比例缩放）
    var CAM_ZOOM = 1493.3;
    var SIZE_DIV = 4820;
    var Z_START = 35;
    var Z_END = 4285;

    // 控制器自定义属性名（绑定路径段，禁含空格/点）
    var P_PANX = "相机X";
    var P_PANY = "相机Y";
    var P_DIST = "相机距离";
    var P_FOCUS = "焦距";

    function getScene() {
        var scene = app.activeScene;
        if (!scene) { alert("请先打开一个场景。"); return null; }
        return scene;
    }

    function isSystemLayer(name) {
        return name === CTRL_NAME || name === WARN_TEXT ||
               name.indexOf("视差已激活") === 0;
    }

    function findLayer(scene, name) {
        var ls = scene.layers();
        for (var i = 0; i < ls.length; i++) {
            if (ls[i].name === name) { return ls[i]; }
        }
        return null;
    }

    function findCtrl(scene) { return findLayer(scene, CTRL_NAME); }

    // 顶层内容层（排除系统层）；AE 原版同样只处理顶层图层
    function contentLayers(scene) {
        var ls = scene.layers();
        var out = [];
        for (var i = 0; i < ls.length; i++) {
            if (!isSystemLayer(ls[i].name)) { out.push(ls[i]); }
        }
        return out;
    }

    function sizeFactor(scene) {
        return (scene.width + scene.height) / SIZE_DIV;
    }
    function defZoom(scene) { return CAM_ZOOM * sizeFactor(scene); }

    // ---- 每层补偿表达式 -------------------------------------------------
    // 绑定源：$value(表达式前基值)/$scene/z(本层3D Z)/f(本层透视)/控制器4参数
    // 铁律：必须绑 frame=$frame（否则换帧冻结）；常量烤进 script 体
    // 公式（AE 针孔投影 + Parallaxer 补偿，默认视角严格还原原画面）：
    //   u = 层中心相对画布中心偏移 = v + C - 画布中心
    //   depth = z + d;  k = zm / depth
    //   新位置 = v + k*((Z0+z)/Z0*u - p) - u
    //   新缩放 = s * (zm*(Z0+z)/(depth*Z0)) * ((f+z)/f)   ← 末项抵消 billboard
    function bindLayer(layer, Z0, cX, cY, sw, sh) {
        var ctrlPath = CTRL_NAME + ".properties.";

        var posBase =
            "frame = $frame;\n" +
            "v = $value;\n" +
            "z = transform.3D position Z;\n" +
            "p = " + ctrlPath;
        var posTail =
            ";\nd = " + ctrlPath + P_DIST + ";\n" +
            "zm = " + ctrlPath + P_FOCUS + ";\n";
        // 场景宽高在 setup 时烤入（AE 原版同样按建场时画布校准）
        var swLit = String(sw);
        var shLit = String(sh);
        var z0Lit = Z0.toFixed(2);

        var err = layer.property("positionx").setExpression(
            posBase + P_PANX + posTail,
            "var u = v + " + cX.toFixed(2) + " - " + swLit + "/2;\n" +
            "var k = zm/(z + d);\n" +
            "return v + k*((" + z0Lit + " + z)/" + z0Lit + "*u - p) - u;");
        if (err) { return "位置X: " + err; }

        err = layer.property("positiony").setExpression(
            posBase + P_PANY + posTail,
            "var u = v + " + cY.toFixed(2) + " - " + shLit + "/2;\n" +
            "var k = zm/(z + d);\n" +
            "return v + k*((" + z0Lit + " + z)/" + z0Lit + "*u - p) - u;");
        if (err) { return "位置Y: " + err; }

        var scaleBindings =
            "frame = $frame;\n" +
            "s = $value;\n" +
            "z = transform.3D position Z;\n" +
            "f = transform.3D perspective;\n" +
            "d = " + ctrlPath + P_DIST + ";\n" +
            "zm = " + ctrlPath + P_FOCUS + ";\n";
        var scaleScript =
            "var m = (zm*(" + z0Lit + " + z))/((z + d)*" +
            z0Lit + ")*(f + z)/f;\n" +
            "return s*m;";

        err = layer.property("scalex").setExpression(scaleBindings, scaleScript);
        if (err) { return "缩放X: " + err; }
        err = layer.property("scaley").setExpression(scaleBindings, scaleScript);
        if (err) { return "缩放Y: " + err; }
        return "";
    }

    // ---- 1. 设置 --------------------------------------------------------
    function doSetup() {
        var scene = getScene();
        if (!scene) { return; }

        if (findCtrl(scene)) {
            alert("视差生成器已应用于此场景。\n如需重新生成，请先烘焙或删除「" +
                  CTRL_NAME + "」控制器层。");
            return;
        }
        var layers = contentLayers(scene);
        if (layers.length === 0) { alert("场景中没有可处理的图层。"); return; }

        var sf = sizeFactor(scene);
        var Z0 = +(CAM_ZOOM * sf).toFixed(2);
        var zStart = Z_START * sf;
        var zEnd = Z_END * sf;

        app.beginUndoGroup("应用视差");
        try {
            // 控制器（相机参数 = 自定义属性，可 K 帧动画）
            var ctrl = scene.addNull(CTRL_NAME);
            if (!ctrl) { throw "无法创建控制器层"; }
            ctrl.numberProperty(P_PANX, 0);
            ctrl.numberProperty(P_PANY, 0);
            ctrl.numberProperty(P_DIST, Z0);
            ctrl.numberProperty(P_FOCUS, Z0);
            log("控制器已创建: " + CTRL_NAME + " (Z0=" + Z0 + ")");

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

            // 警告层（AE 版：红色大字提示，Friction 文字层）
            var warn = scene.addText(WARN_TEXT, WARN_TEXT);
            if (warn) {
                warn.position().setValue(
                    [scene.width / 2, (scene.width + scene.height) / 60]);
            }

            if (errs.length > 0) {
                alert("设置完成，但 " + errs.length + " 个图层表达式失败：\n" +
                      errs.join("\n"));
            } else {
                alert("视差已激活（" + n + " 层，Z 分布 " +
                      zStart.toFixed(0) + " → " + zEnd.toFixed(0) + "）。\n\n" +
                      "动画图层「" + CTRL_NAME + "」的自定义属性产生视差：\n" +
                      "· " + P_PANX + " / " + P_PANY + " —— 相机平移\n" +
                      "· " + P_DIST + " —— 推拉（数值越小越近，视差越强）\n" +
                      "· " + P_FOCUS + " —— 焦距（默认即原画面）\n\n" +
                      "完成后请点「烘焙」。");
            }
            log("setup 完成: 层数=" + n + " Z0=" + Z0 +
                " zStart=" + zStart.toFixed(1) + " zEnd=" + zEnd.toFixed(1));
        } catch (e) {
            alert("设置出错: " + e);
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
            if (!isSystemLayer(sel[i].name)) { valid.push(sel[i]); }
        }
        if (valid.length < 2) {
            alert("请至少选择两个图层（" + label + "）。");
            return;
        }

        var zs = [];
        var sum = 0;
        for (var i = 0; i < valid.length; i++) {
            var z = valid[i].zPosition().value();
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

    // ---- 3. 重置相机 ----------------------------------------------------
    function doResetCamera() {
        var scene = getScene();
        if (!scene) { return; }
        var ctrl = findCtrl(scene);
        if (!ctrl) {
            alert("未找到视差控制器，请先点「应用视差」。");
            return;
        }
        var Z0 = +defZoom(scene).toFixed(2);
        app.beginUndoGroup("重置相机");
        try {
            ctrl.numberProperty(P_PANX, 0).setValue(0);
            ctrl.numberProperty(P_PANY, 0).setValue(0);
            ctrl.numberProperty(P_DIST, Z0).setValue(Z0);
            ctrl.numberProperty(P_FOCUS, Z0).setValue(Z0);
            log("相机已重置 (Z0=" + Z0 + ")");
        } catch (e) {
            alert("出错: " + e);
            log("重置相机异常: " + e);
        } finally {
            app.endUndoGroup();
        }
    }

    // ---- 4. 烘焙 --------------------------------------------------------
    // AE 版语义：删警告层 + 重置相机 + 表达式值固化为静态值 + 删全部键。
    // Friction 实现要点：
    // - 位置表达式在默认相机下输出=基值，clearExpression 即还原
    // - 缩放需固化 s*(f+z)/f：zPos 保留时 billboard 透视仍在，固化值
    //   内含抵消因子，画面严格保持 flat 原样
    // - zPos 与 3D 开关保留（AE 同样保留 3D 位置，便于后续继续调节）
    function doBake() {
        var scene = getScene();
        if (!scene) { return; }
        var ctrl = findCtrl(scene);
        if (!ctrl) {
            alert("未找到视差控制器，请先点「应用视差」。");
            return;
        }

        app.beginUndoGroup("烘焙");
        try {
            // 删警告层
            var warn = findLayer(scene, WARN_TEXT);
            if (!warn) {
                var ls = scene.layers();
                for (var i = 0; i < ls.length; i++) {
                    if (ls[i].name.indexOf("视差已激活") === 0) {
                        warn = ls[i]; break;
                    }
                }
            }
            if (warn) { warn.remove(); }

            // 重置相机（AE 版行为）
            var Z0 = +defZoom(scene).toFixed(2);
            ctrl.numberProperty(P_PANX, 0).setValue(0);
            ctrl.numberProperty(P_PANY, 0).setValue(0);
            ctrl.numberProperty(P_DIST, Z0).setValue(Z0);
            ctrl.numberProperty(P_FOCUS, Z0).setValue(Z0);

            var layers = contentLayers(scene);
            var done = 0;
            for (var i = 0; i < layers.length; i++) {
                var L = layers[i];
                try {
                    var z = L.zPosition().value();
                    var f = L.perspective().value();
                    if (!isFinite(f) || f < 1) { f = 800; }
                    var comp = (f + z) / f;

                    var sx = L.property("scalex");
                    var sy = L.property("scaley");
                    if (sx.hasExpression()) {
                        var sv = sx.value() * comp;
                        sx.clearExpression();
                        sx.setValue(+sv.toFixed(4));
                    }
                    if (sy.hasExpression()) {
                        var sv2 = sy.value() * comp;
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

            alert("烘焙完成（" + done + "/" + layers.length +
                  " 层），可以开始动画了。");
            log("bake 完成: " + done + "/" + layers.length);
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
            { label: "重置相机", tooltip: "相机参数恢复初始位置（画面=原始平铺）",
              onClick: doResetCamera },
            { label: "烘焙", tooltip: "移除表达式与动态功能，固化画面，加速场景",
              onClick: doBake }
        ],
        extraButtons: [
            { label: "⚙ 应用视差", tooltip: "Z 轴分布全部图层 + 建立视差相机（选好场景后点击）",
              onClick: doSetup },
            { label: "☰ 调试日志", tooltip: "查看并复制调试日志",
              onClick: function () {
                  alert(debugLog.length > 0 ? debugLog.join("\n") : "暂无日志");
              } }
        ]
    });
})();
