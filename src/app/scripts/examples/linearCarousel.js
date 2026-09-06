// 线性轮播 - 移植自 AE CEP「自动化图层工具集」linearCarousel.jsx
//
// 选中多个图层后执行：自动统一图层尺寸，横向等距排列，
// 图层位置跟随「线性轮播控制器」Null 的位置（K 控制器 X 即可
// 实现左右滑动轮播），越靠近画布中心的图层越大，两侧缩小。
//
// 引擎适配说明（相对 AE 原版）：
//   - 位置/缩放通过 property("positionx"/"scalex") 等子动画器
//     挂表达式（表达式只能挂在标量动画器上）
//   - AE 的"平滑时间"低通滤波在原版中读 value 当上帧状态，
//     实际产生的是恒定偏移而非时间平滑（远端卡片停在 92.5%
//     而非设定的最小缩放），属于原版缺陷，本版未移植，
//     改用可选的距离衰减曲线（线性/Smoothstep/Sine）
//   - 缩放单位为分数（1.0 = 100%），非 AE 百分比
//   - 参数在生成时写入表达式常量；改参数后重新执行即可覆盖

(function () {
    var SCRIPT_NAME = "线性轮播";
    var CTRL_NAME = "线性轮播控制器";

    var settings = {
        spacing: 400,      // 相邻图层水平间距 px
        maxScale: 150,     // 最大缩放 %
        minScale: 50,      // 最小缩放 %
        range: 600,        // 缩放影响范围 px（以画布中心为圆心）
        curve: 1           // 0=线性 1=Smoothstep 2=Sine
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

    // 查找或创建控制器 Null，并放到画布中心
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
        return ctrl;
    }

    // 统一图层像素宽为画布短边 25%：先把轴心居中于内容，
    // 再按 bounds 宽度换算缩放分数（1.0 = 100%）
    function unifySize(layer) {
        var b = layer.bounds();
        if (!b || b.width <= 0 || b.height <= 0) return null;
        layer.setAnchorPoint([b.left + b.width / 2,
                              b.top + b.height / 2]);
        var targetPx = Math.min(sceneW, sceneH) * 0.25;
        var s = targetPx / b.width;
        layer.property("scale").setValue([s, s]);
        return { px: targetPx, pivot: [b.left + b.width / 2,
                                       b.top + b.height / 2] };
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

            var maxS = settings.maxScale / 100;
            var minS = settings.minScale / 100;
            var range = settings.range;
            var spacing = settings.spacing;
            var curve = settings.curve;

            var bound = 0;
            for (var k = 0; k < n; k++) {
                var layer = layers[k];
                var uni = unifySize(layer);
                if (!uni) { log("跳过 " + layer.name + "：无法获取边界"); continue; }
                var orderIdx = k;
                var centerOffset = orderIdx - (n - 1) / 2;
                var pivX = uni.pivot[0].toFixed(2);
                var pivY = uni.pivot[1].toFixed(2);

                // 位置：X = 控制器X + 中心偏移*间距；Y = 控制器Y
                // （pos + pivot = 视觉中心，故表达式里减去轴心）
                // 注意：bindings 区只接受属性路径/$frame/$value/$scene.*，
                // 字面量常量必须烤进 script 函数体；
                // $frame 绑定=换帧信号生死线，缺了播放/换帧不重新求值
                var offsetX = (centerOffset * spacing).toFixed(2);
                var err = layer.property("positionx").setExpression(
                    "frame = $frame;\n" +
                    "cx = " + CTRL_NAME + ".transform.translation.x;",
                    "return cx + (" + offsetX + ") - " + pivX + ";");
                if (err) { log(layer.name + " 位置X表达式失败: " + err); continue; }

                err = layer.property("positiony").setExpression(
                    "frame = $frame;\n" +
                    "cy = " + CTRL_NAME + ".transform.translation.y;",
                    "return cy - " + pivY + ";");
                if (err) { log(layer.name + " 位置Y表达式失败: " + err); continue; }

                // 缩放：距画布中心越近越大（X/Y 同步缩放）
                var scaleBindings =
                    "frame = $frame;\n" +
                    "cx = " + CTRL_NAME + ".transform.translation.x;\n" +
                    "mx = transform.translation.x;\n" +
                    "sc = $scene.width;";
                var scaleScript =
                    "var d = Math.abs((mx + " + pivX + ") - sc / 2);\n" +
                    "var t = d < " + range.toFixed(2) +
                    " ? 1 - d / " + range.toFixed(2) + " : 0;\n" +
                    "var f;\n" +
                    "if (" + curve + " === 0) { f = t; }\n" +
                    "else if (" + curve + " === 1) { f = t * t * (3 - 2 * t); }\n" +
                    "else { f = Math.sin(t * Math.PI / 2); }\n" +
                    "return " + minS + " + (" + maxS + " - " + minS + ") * f;";
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
            log("绑定完成: " + bound + "/" + n + " 个图层, 间距=" + spacing +
                ", 缩放=" + settings.minScale + "%~" + settings.maxScale +
                "%, 范围=" + range);

            // 选中控制器方便直接拖动
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
              "3. 拖动「线性轮播控制器」Null 的 X 位置 → 图层左右滑动\n" +
              "4. 对控制器 X 位置打关键帧即可做自动轮播动画\n\n" +
              "参数：\n" +
              "· 图层间距：相邻图层的水平像素间距\n" +
              "· 最大/最小缩放：滑到中间/远离中间的比例\n" +
              "· 影响范围：以画布中心为准的缩放衰减范围\n" +
              "· 衰减曲线：距离→缩放的映射\n\n" +
              "提示：图层尺寸会统一为画布短边的 25%；\n" +
              "修改参数后重新执行即可覆盖旧表达式。");
    }

    registerPanel({
        title: SCRIPT_NAME, columns: 2,
        sliders: [
            { label: "间距", id: "spacing", min: 50, max: 2000, value: settings.spacing, decimals: 0,
              tooltip: "相邻图层的水平像素间距", onChange: function (v) { settings.spacing = v; } },
            { label: "最大%", id: "maxS", min: 100, max: 300, value: settings.maxScale, decimals: 0,
              tooltip: "滑到画布中心时的放大百分比", onChange: function (v) { settings.maxScale = v; } },
            { label: "最小%", id: "minS", min: 10, max: 100, value: settings.minScale, decimals: 0,
              tooltip: "远离中心时的缩小百分比", onChange: function (v) { settings.minScale = v; } },
            { label: "范围", id: "range", min: 100, max: 2000, value: settings.range, decimals: 0,
              tooltip: "缩放衰减的影响像素范围", onChange: function (v) { settings.range = v; } }
        ],
        combos: [
            { label: "衰减", id: "curve", options: ["线性", "Smoothstep", "Sine"], index: settings.curve,
              tooltip: "距离→缩放强度的映射曲线",
              onChange: function (i) { settings.curve = i; } }
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
