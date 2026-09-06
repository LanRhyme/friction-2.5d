// 轮播 - 移植自 AE CEP「自动化图层工具集」
// linearCarousel.jsx / xAxisCarousel.jsx / yAxisCarousel.jsx 三合一
//
// 排布三模式：
//   线性     = 图层横向等距排开，拖/K 控制器 X 位置左右滑动，
//              越靠近画布中心越大（AE 线性轮播）
//   水平环   = 图层沿水平圆环（X-Z 平面）均布，顶视图是一个
//              圆圈、有 z 轴空间；K 控制器「旋转」整环转动
//              （AE Y轴轮播）
//   竖直环   = 图层沿竖直圆环（Y-Z 平面）均布，正面看是圆圈
//              （AE X轴轮播）
//
// 参数存放（AE 滑块控制特效的 Friction 对应物）：
//   线性参数（间距/最大缩放/最小缩放/影响范围/衰减）与环形参数
//   （直径/间隔）都存在控制器「properties」自定义属性上——时间轴
//   可直接调、可 K 关键帧、面板滑杆拖动实时写入。
//   每张卡的序号偏移/轴心是生成时烤入的常量。
//
// 引擎适配说明：
//   - 位置/缩放通过 positionx/scalex 等子动画器挂表达式
//     （表达式只能挂标量动画器）
//   - bindings 区只接受属性路径/$frame/$value/$scene.*，常量烤进
//     script；$frame 绑定=换帧信号生死线，必须带
//   - AE 原版"平滑时间"低通滤波是 value 误用 bug，未移植
//   - 缩放单位为分数（1.0=100%），properties 里按 AE 惯例存百分比
//   - 卡片请放场景顶层（与控制器同层级），勿嵌套在变换过的组内

(function () {
    var SCRIPT_NAME = "轮播";
    var CTRL_NAME = "轮播控制器";
    var P = { SPACING: "间距", MAX: "最大缩放", MIN: "最小缩放",
              RANGE: "影响范围", CURVE: "衰减",
              DIA: "直径", STEP: "间隔" };

    var settings = {
        mode: 1,        // 0=线性 1=水平环(顶视图圆圈) 2=竖直环
        spacing: 400, maxScale: 150, minScale: 50,
        range: 600, curve: 1,
        diameter: 1600, step: 0,   // 间隔 0=自动均分 360/n
        face: 0        // 0=朝向圆心(外翻) 1=固定朝向
    };

    var debugLog = [];
    function log(msg) { debugLog.push(msg); print(msg); if (debugLog.length > 300) debugLog.shift(); }
    var boundNames = [];   // 已绑定卡片名，复查读数用

    function requireSelection() {
        var scene = app.activeScene;
        if (!scene) { alert("请先打开一个场景"); return null; }
        var sel = scene.selectedLayers();
        if (!sel || sel.length === 0) { alert("请先选择一个或多个图层"); return null; }
        return { scene: scene, sel: sel };
    }

    function findCtrl() {
        var scene = app.activeScene;
        return scene ? scene.layer(CTRL_NAME) : null;
    }

    // 面板滑杆 → 控制器属性实时写入（控制器不存在时静默跳过，
    // 生成时会用面板值创建）
    function writeProp(name, v) {
        var ctrl = findCtrl();
        if (!ctrl) return;
        var p = ctrl.numberProperty(name, v);
        if (p) p.setValue(v);
    }

    function ensureController(scene, needProps) {
        var ctrl = scene.layer(CTRL_NAME);
        if (!ctrl) {
            ctrl = scene.addNull(CTRL_NAME);
            if (!ctrl) { log("创建控制器失败"); return null; }
            log("已创建控制器: " + CTRL_NAME);
        } else {
            log("复用已存在的控制器: " + CTRL_NAME);
        }
        ctrl.property("position").setValue(
            [scene.width / 2, scene.height / 2]);
        if (settings.mode !== 0) ctrl.set3DEnabled(true);
        // 参数上控制器（存在则用面板值刷新，缺失则按面板值创建）
        for (var i = 0; i < needProps.length; i++) {
            var pr = needProps[i];
            ctrl.numberProperty(pr.name, pr.v).setValue(pr.v);
        }
        return ctrl;
    }

    // 轴心居中于内容；线性模式顺带统一像素宽为画布短边 25%
    function prepLayer(layer, unify) {
        var b = layer.bounds();
        if (!b || b.width <= 0 || b.height <= 0) return null;
        var piv = [b.left + b.width / 2, b.top + b.height / 2];
        layer.setAnchorPoint(piv);
        if (unify) {
            var s = (Math.min(sceneW, sceneH) * 0.25) / b.width;
            layer.property("scale").setValue([s, s]);
        }
        return { pivot: piv };
    }

    var sceneW = 0, sceneH = 0;

    // ---- 线性：横向排开 + 中心放大 --------------------------------

    function bindLinear(layer, orderIdx, n, uni) {
        var centerOffset = orderIdx - (n - 1) / 2;
        var pivX = uni.pivot[0].toFixed(2);
        var pivY = uni.pivot[1].toFixed(2);

        var err = layer.property("positionx").setExpression(
            "frame = $frame;\n" +
            "cx = " + CTRL_NAME + ".transform.translation.x;\n" +
            "sp = " + CTRL_NAME + ".properties." + P.SPACING + ";",
            "return cx + (" + centerOffset.toFixed(4) + ") * sp - " + pivX + ";");
        if (err) return "位置X: " + err;

        err = layer.property("positiony").setExpression(
            "frame = $frame;\n" +
            "cy = " + CTRL_NAME + ".transform.translation.y;",
            "return cy - " + pivY + ";");
        if (err) return "位置Y: " + err;

        var scaleBindings =
            "frame = $frame;\n" +
            "mx = transform.translation.x;\n" +
            "sc = $scene.width;\n" +
            "rg = " + CTRL_NAME + ".properties." + P.RANGE + ";\n" +
            "mxs = " + CTRL_NAME + ".properties." + P.MAX + ";\n" +
            "mns = " + CTRL_NAME + ".properties." + P.MIN + ";\n" +
            "cv = " + CTRL_NAME + ".properties." + P.CURVE + ";";
        var scaleScript =
            "var d = Math.abs((mx + " + pivX + ") - sc / 2);\n" +
            "var t = d < rg ? 1 - d / rg : 0;\n" +
            "var f;\n" +
            "if (cv < 0.5) { f = t; }\n" +
            "else if (cv < 1.5) { f = t * t * (3 - 2 * t); }\n" +
            "else { f = Math.sin(t * Math.PI / 2); }\n" +
            "return mns / 100 + (mxs / 100 - mns / 100) * f;";
        err = layer.property("scalex").setExpression(scaleBindings, scaleScript);
        if (err) return "缩放X: " + err;
        err = layer.property("scaley").setExpression(scaleBindings, scaleScript);
        if (err) return "缩放Y: " + err;
        return "";
    }

    // ---- 环形：X-Z(水平,顶视圆圈) 或 Y-Z(竖直) 圆环 -----------------

    function bindRing(layer, orderIdx, uni, isY) {
        var pivX = uni.pivot[0].toFixed(2);
        var pivY = uni.pivot[1].toFixed(2);
        var faceOut = settings.face === 0;

        // 角度 = 控制器旋转 + 序号*间隔；半径 = 直径/2
        var bind =
            "frame = $frame;\n" +
            "rot = " + CTRL_NAME + ".transform.rotation;\n" +
            "cp = " + CTRL_NAME + ".transform.translation;\n" +
            "cz = " + CTRL_NAME + ".transform.3D position Z;\n" +
            "rd = " + CTRL_NAME + ".properties." + P.DIA + ";\n" +
            "sp = " + CTRL_NAME + ".properties." + P.STEP + ";";
        var ringXY =
            "var a = (rot + " + orderIdx + " * sp) * Math.PI / 180;\n" +
            "var s = (rd / 2) * Math.sin(a);\n";

        var err = layer.property("positionx").setExpression(bind,
            isY ? ringXY + "return cp[0] + s - " + pivX + ";"
                : ringXY + "return cp[0] - " + pivX + ";");
        if (err) return "位置X: " + err;

        err = layer.property("positiony").setExpression(bind,
            isY ? "return cp[1] - " + pivY + ";"
                : ringXY + "return cp[1] + s - " + pivY + ";");
        if (err) return "位置Y: " + err;

        err = layer.property("zposition").setExpression(bind,
            "var a = (rot + " + orderIdx + " * sp) * Math.PI / 180;\n" +
            "return cz - (rd / 2) * Math.cos(a);");
        if (err) return "位置Z: " + err;

        var rotExpr = faceOut
            ? "return rot + " + orderIdx + " * sp;"
            : "return 0;";
        err = layer.property(isY ? "rotationy" : "rotationx")
                  .setExpression(bind, rotExpr);
        if (err) return "旋转: " + err;
        return "";
    }

    // ---- 主入口 ----------------------------------------------------

    function runCarousel() {
        var ctx = requireSelection();
        if (!ctx) return;
        var scene = ctx.scene;
        sceneW = scene.width; sceneH = scene.height;

        app.beginUndoGroup(SCRIPT_NAME);
        try {
            var layers = [];
            for (var i = 0; i < ctx.sel.length; i++) {
                if (ctx.sel[i].name === CTRL_NAME) continue;
                layers.push(ctx.sel[i]);
            }
            layers.sort(function (a, b) { return a.index - b.index; });
            var n = layers.length;
            if (n === 0) { alert("除控制器外没有可选图层"); return; }

            var isLinear = settings.mode === 0;
            var needProps = isLinear ? [
                { name: P.SPACING, v: settings.spacing },
                { name: P.MAX, v: settings.maxScale },
                { name: P.MIN, v: settings.minScale },
                { name: P.RANGE, v: settings.range },
                { name: P.CURVE, v: settings.curve }
            ] : [
                { name: P.DIA, v: settings.diameter },
                { name: P.STEP, v: settings.step > 0 ? settings.step : 360 / n }
            ];
            var ctrl = ensureController(scene, needProps);
            if (!ctrl) { alert("控制器创建失败"); return; }

            boundNames = [];
            var bound = 0;
            for (var k = 0; k < n; k++) {
                var layer = layers[k];
                if (!isLinear) layer.set3DEnabled(true);
                var uni = prepLayer(layer, isLinear);
                if (!uni) { log("跳过 " + layer.name + "：无法获取边界"); continue; }

                var err = isLinear
                    ? bindLinear(layer, k, n, uni)
                    : bindRing(layer, k, uni, settings.mode === 1);
                if (err) { log(layer.name + " 表达式失败 " + err); continue; }

                logReadout(layer, uni, !isLinear);
                boundNames.push(layer.name);
                bound++;
            }
            log("绑定完成: " + bound + "/" + n + " 个图层（" +
                (isLinear ? "线性" : (settings.mode === 1 ? "水平环" : "竖直环")) + "）");
            log(isLinear
                ? "动画入口：K 控制器 X 位置"
                : "动画入口：K 控制器旋转；顶视图(水平环)应是一个圆圈");

            for (var j = 0; j < layers.length; j++) layers[j].selected = false;
            ctrl.selected = true;
        } catch (err) {
            log("执行出错: " + err);
            alert("执行出错: " + err);
        } finally {
            app.endUndoGroup();
        }
    }

    // 生效值回读（含表达式结果）：验证表达式真的在出数
    function logReadout(layer, uni, withZ) {
        var pv = layer.property("position").effectiveValue();
        var sv = layer.property("scalex").effectiveValue();
        var msg = layer.name + " 生效: 中心=[" +
            (pv[0] + uni.pivot[0]).toFixed(0) + ", " +
            (pv[1] + uni.pivot[1]).toFixed(0) + "] 缩放=" +
            (sv * 100).toFixed(0) + "%";
        if (withZ) {
            msg += " z=" + layer.property("zposition").effectiveValue().toFixed(0);
        }
        log(msg);
    }

    // 复查读数：重新读所有已绑定卡片的当前生效值（诊断拖动/调参
    // 后表达式是否真的跟着变）
    function recheck() {
        var scene = app.activeScene;
        if (!scene || boundNames.length === 0) {
            alert("还没有绑定记录，请先「生成轮播」");
            return;
        }
        log("=== 复查读数 ===");
        for (var i = 0; i < boundNames.length; i++) {
            var layer = scene.layer(boundNames[i]);
            if (!layer) { log(boundNames[i] + "：图层已不存在"); continue; }
            var pv = layer.property("position").effectiveValue();
            var sv = layer.property("scalex").effectiveValue();
            var piv = layer.anchorPoint();
            var msg = boundNames[i] + " 中心=[" +
                (pv[0] + (piv ? piv[0] : 0)).toFixed(0) + ", " +
                (pv[1] + (piv ? piv[1] : 0)).toFixed(0) + "] 缩放=" +
                (sv * 100).toFixed(0) + "%";
            if (layer.property("zposition").hasExpression()) {
                msg += " z=" + layer.property("zposition").effectiveValue().toFixed(0);
            }
            log(msg);
        }
        alert("已写入调试日志，点「☰ 调试日志」查看");
    }

    function showHelp() {
        alert("使用方法：\n" +
              "1. 选中若干图层（按时间轴顺序）→「生成轮播」\n" +
              "2. 排布=水平环：顶视图是一个圆圈，有 z 轴空间；\n" +
              "   K「轮播控制器」的「旋转」→ 整环转动\n" +
              "3. 排布=竖直环：正面看是圆圈（AE X轴轮播）\n" +
              "4. 排布=线性：拖/K 控制器 X 位置左右滑动，\n" +
              "   越靠近画布中心越大（AE 线性轮播）\n" +
              "5. 环形建议加摄像机图层取景（图层已自动开 3D）\n\n" +
              "参数（控制器 properties 行，可 K 帧，面板实时写入）：\n" +
              "· 直径/间隔：环形圆环尺寸与角度步进（0=均分）\n" +
              "· 间距/最大%/最小%/范围/衰减：线性模式专用\n" +
              "· 朝向：圆心=卡片外翻；固定=朝向不变（重新生成生效）\n\n" +
              "拖面板滑杆实时调参数；「复查读数」回读表达式生效值。\n" +
              "卡片请放场景顶层（勿嵌套在变换过的组内）。");
    }

    registerPanel({
        title: SCRIPT_NAME, columns: 2,
        sliders: [
            { label: "直径", id: "dia", min: 200, max: 6000, value: settings.diameter, decimals: 0,
              tooltip: "环形：圆环直径像素（实时）",
              onChanging: function (v) { settings.diameter = v; writeProp(P.DIA, v); },
              onChange: function (v) { settings.diameter = v; writeProp(P.DIA, v); } },
            { label: "间隔°", id: "step", min: 0, max: 360, value: settings.step, decimals: 1,
              tooltip: "环形：相邻图层角度，0=自动均分（实时）",
              onChanging: function (v) { settings.step = v; if (v > 0) writeProp(P.STEP, v); },
              onChange: function (v) { settings.step = v; if (v > 0) writeProp(P.STEP, v); } },
            { label: "间距", id: "spacing", min: 50, max: 2000, value: settings.spacing, decimals: 0,
              tooltip: "线性：相邻图层水平像素间距（实时）",
              onChanging: function (v) { settings.spacing = v; writeProp(P.SPACING, v); },
              onChange: function (v) { settings.spacing = v; writeProp(P.SPACING, v); } },
            { label: "最大%", id: "maxS", min: 100, max: 300, value: settings.maxScale, decimals: 0,
              tooltip: "线性：滑到画布中心时的放大百分比（实时）",
              onChanging: function (v) { settings.maxScale = v; writeProp(P.MAX, v); },
              onChange: function (v) { settings.maxScale = v; writeProp(P.MAX, v); } },
            { label: "最小%", id: "minS", min: 10, max: 100, value: settings.minScale, decimals: 0,
              tooltip: "线性：远离中心时的缩小百分比（实时）",
              onChanging: function (v) { settings.minScale = v; writeProp(P.MIN, v); },
              onChange: function (v) { settings.minScale = v; writeProp(P.MIN, v); } },
            { label: "范围", id: "range", min: 100, max: 2000, value: settings.range, decimals: 0,
              tooltip: "线性：缩放衰减影响像素范围（实时）",
              onChanging: function (v) { settings.range = v; writeProp(P.RANGE, v); },
              onChange: function (v) { settings.range = v; writeProp(P.RANGE, v); } }
        ],
        combos: [
            { label: "排布", id: "mode", options: ["线性", "水平环(顶视圆圈)", "竖直环"], index: settings.mode,
              tooltip: "水平环=X-Z平面圆环（顶视图圆圈）；竖直环=Y-Z平面；线性=横向滑动",
              onChange: function (i) { settings.mode = i; } },
            { label: "朝向", id: "face", options: ["圆心(外翻)", "固定"], index: settings.face,
              tooltip: "环形：圆心=卡片随环角外翻；固定=朝向不变（重新生成生效）",
              onChange: function (i) { settings.face = i; } },
            { label: "衰减", id: "curve", options: ["线性", "Smoothstep", "Sine"], index: settings.curve,
              tooltip: "线性模式：距离→缩放映射曲线（实时）",
              onChange: function (i) { settings.curve = i; writeProp(P.CURVE, i); } }
        ],
        extraButtons: [
            { label: "▶ 生成轮播", tooltip: "按当前排布与参数绑定选中图层", onClick: runCarousel },
            { label: "复查读数", tooltip: "回读所有已绑定卡片的表达式生效值", onClick: recheck },
            { label: "? 帮助", tooltip: "使用说明", onClick: showHelp },
            {
                label: "☰ 调试日志",
                tooltip: "查看并复制调试日志",
                onClick: function () {
                    alert(debugLog.length > 0 ? debugLog.join("\n") : "暂无日志");
                }
            }
        ]
    });
    registerCommand("轮播: 生成", runCarousel);
})();
