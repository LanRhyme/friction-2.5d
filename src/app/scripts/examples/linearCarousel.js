// 线性轮播 - 移植自 AE CEP「自动化图层工具集」linearCarousel.jsx
//
// 选中多个图层后执行：自动统一图层尺寸，横向等距排列，
// 图层位置跟随「线性轮播控制器」Null 的位置（K 控制器 X 即可
// 实现左右滑动轮播），越靠近画布中心的图层越大，两侧缩小。
//
// 参数存放（AE 滑块控制特效的 Friction 对应物）：
//   间距/最大缩放/最小缩放/影响范围/衰减 全部存在控制器的
//   「properties」自定义属性上——时间轴可直接调、可 K 关键帧、
//   面板滑杆拖动实时写入（控制器存在时即实时预览）。
//   每张卡自己的序号偏移和轴心是生成时烤入的常量。
//
// 引擎适配说明：
//   - 位置/缩放通过 property("positionx"/"scalex") 等子动画器
//     挂表达式（表达式只能挂在标量动画器上）
//   - bindings 区只接受属性路径/$frame/$value/$scene.*，常量必须
//     烤进 script；$frame 绑定=换帧信号生死线，必须带
//   - AE 原版"平滑时间"低通滤波是 value 误用 bug，未移植
//   - 缩放单位为分数（1.0 = 100%），properties 里按 AE 惯例存百分比

(function () {
    var SCRIPT_NAME = "线性轮播";
    var CTRL_NAME = "线性轮播控制器";
    var P = { SPACING: "间距", MAX: "最大缩放", MIN: "最小缩放",
              RANGE: "影响范围", CURVE: "衰减" };

    var settings = {
        spacing: 400, maxScale: 150, minScale: 50,
        range: 600, curve: 1
    };

    var debugLog = [];
    function log(msg) { debugLog.push(msg); print(msg); if (debugLog.length > 300) debugLog.shift(); }

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

    function ensureController(scene) {
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
        // 参数上控制器（存在则用面板值刷新，缺失则按面板值创建）
        ctrl.numberProperty(P.SPACING, settings.spacing).setValue(settings.spacing);
        ctrl.numberProperty(P.MAX, settings.maxScale).setValue(settings.maxScale);
        ctrl.numberProperty(P.MIN, settings.minScale).setValue(settings.minScale);
        ctrl.numberProperty(P.RANGE, settings.range).setValue(settings.range);
        ctrl.numberProperty(P.CURVE, settings.curve).setValue(settings.curve);
        return ctrl;
    }

    // 统一图层像素宽为画布短边 25%：轴心居中于内容后按
    // bounds 宽换算缩放分数（1.0 = 100%）
    function unifySize(layer) {
        var b = layer.bounds();
        if (!b || b.width <= 0 || b.height <= 0) return null;
        layer.setAnchorPoint([b.left + b.width / 2,
                              b.top + b.height / 2]);
        var targetPx = Math.min(sceneW, sceneH) * 0.25;
        var s = targetPx / b.width;
        layer.property("scale").setValue([s, s]);
        return { pivot: [b.left + b.width / 2, b.top + b.height / 2] };
    }

    var sceneW = 0, sceneH = 0;

    function runLinear() {
        var ctx = requireSelection();
        if (!ctx) return;
        var scene = ctx.scene;
        sceneW = scene.width; sceneH = scene.height;

        app.beginUndoGroup(SCRIPT_NAME);
        try {
            var ctrl = ensureController(scene);
            if (!ctrl) { alert("控制器创建失败"); return; }

            var layers = [];
            for (var i = 0; i < ctx.sel.length; i++) {
                if (ctx.sel[i].name === CTRL_NAME) continue;
                layers.push(ctx.sel[i]);
            }
            layers.sort(function (a, b) { return a.index - b.index; });
            var n = layers.length;
            if (n === 0) { alert("除控制器外没有可选图层"); return; }

            var bound = 0;
            for (var k = 0; k < n; k++) {
                var layer = layers[k];
                var uni = unifySize(layer);
                if (!uni) { log("跳过 " + layer.name + "：无法获取边界"); continue; }
                var orderIdx = k;
                var centerOffset = orderIdx - (n - 1) / 2;
                var pivX = uni.pivot[0].toFixed(2);
                var pivY = uni.pivot[1].toFixed(2);

                // 位置：X = 控制器X + 序号偏移*间距；Y = 控制器Y
                var err = layer.property("positionx").setExpression(
                    "frame = $frame;\n" +
                    "cx = " + CTRL_NAME + ".transform.translation.x;\n" +
                    "sp = " + CTRL_NAME + ".properties." + P.SPACING + ";",
                    "return cx + (" + centerOffset.toFixed(4) + ") * sp - " + pivX + ";");
                if (err) { log(layer.name + " 位置X表达式失败: " + err); continue; }

                err = layer.property("positiony").setExpression(
                    "frame = $frame;\n" +
                    "cy = " + CTRL_NAME + ".transform.translation.y;",
                    "return cy - " + pivY + ";");
                if (err) { log(layer.name + " 位置Y表达式失败: " + err); continue; }

                // 缩放：距画布中心越近越大（X/Y 同步）
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
                if (err) { log(layer.name + " 缩放X表达式失败: " + err); continue; }
                err = layer.property("scaley").setExpression(scaleBindings, scaleScript);
                if (err) { log(layer.name + " 缩放Y表达式失败: " + err); continue; }

                // 生效值回读（含表达式结果），验证表达式真的在出数
                var pv = layer.property("position").effectiveValue();
                var sv = layer.property("scalex").effectiveValue();
                log(layer.name + " 生效: 中心=[" +
                    (pv[0] + uni.pivot[0]).toFixed(0) + ", " +
                    (pv[1] + uni.pivot[1]).toFixed(0) + "] 缩放=" +
                    (sv * 100).toFixed(0) + "%");
                bound++;
            }
            log("绑定完成: " + bound + "/" + n + " 个图层");
            log("调参数：拖面板滑杆（实时）或控制器 properties 行（可K帧）");

            for (var j = 0; j < layers.length; j++) layers[j].selected = false;
            ctrl.selected = true;
        } catch (err) {
            log("执行出错: " + err);
            alert("执行出错: " + err);
        } finally {
            app.endUndoGroup();
        }
    }

    function showHelp() {
        alert("使用方法：\n" +
              "1. 选中多个图层（按时间轴顺序排列）\n" +
              "2. 点击「生成轮播」\n" +
              "3. 拖动「线性轮播控制器」的 X 位置 → 图层左右滑动\n" +
              "4. 对控制器 X 位置 K 关键帧即可做自动轮播动画\n\n" +
              "参数（控制器 properties 行，可 K 帧）：\n" +
              "· 间距：相邻图层的水平像素间距\n" +
              "· 最大/最小缩放：滑到中间/远离中间的百分比\n" +
              "· 影响范围：以画布中心为准的衰减像素范围\n" +
              "· 衰减：0=线性 1=Smoothstep 2=Sine\n\n" +
              "面板滑杆拖动即实时写入控制器属性；\n" +
              "生成时面板值会覆盖控制器上的同名参数；\n" +
              "图层尺寸统一为画布短边的 25%。");
    }

    registerPanel({
        title: SCRIPT_NAME, columns: 2,
        sliders: [
            { label: "间距", id: "spacing", min: 50, max: 2000, value: settings.spacing, decimals: 0,
              tooltip: "相邻图层的水平像素间距（实时写入控制器）",
              onChanging: function (v) { settings.spacing = v; writeProp(P.SPACING, v); },
              onChange: function (v) { settings.spacing = v; writeProp(P.SPACING, v); } },
            { label: "最大%", id: "maxS", min: 100, max: 300, value: settings.maxScale, decimals: 0,
              tooltip: "滑到画布中心时的放大百分比（实时）",
              onChanging: function (v) { settings.maxScale = v; writeProp(P.MAX, v); },
              onChange: function (v) { settings.maxScale = v; writeProp(P.MAX, v); } },
            { label: "最小%", id: "minS", min: 10, max: 100, value: settings.minScale, decimals: 0,
              tooltip: "远离中心时的缩小百分比（实时）",
              onChanging: function (v) { settings.minScale = v; writeProp(P.MIN, v); },
              onChange: function (v) { settings.minScale = v; writeProp(P.MIN, v); } },
            { label: "范围", id: "range", min: 100, max: 2000, value: settings.range, decimals: 0,
              tooltip: "缩放衰减的影响像素范围（实时）",
              onChanging: function (v) { settings.range = v; writeProp(P.RANGE, v); },
              onChange: function (v) { settings.range = v; writeProp(P.RANGE, v); } }
        ],
        combos: [
            { label: "衰减", id: "curve", options: ["线性", "Smoothstep", "Sine"], index: settings.curve,
              tooltip: "距离→缩放强度的映射曲线（实时写入控制器）",
              onChange: function (i) { settings.curve = i; writeProp(P.CURVE, i); } }
        ],
        extraButtons: [
            { label: "▶ 生成轮播", tooltip: "按当前参数绑定选中图层", onClick: runLinear },
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
    registerCommand("线性轮播: 生成", runLinear);
})();
