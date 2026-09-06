// 卡片缩放（模拟鼠标）- 移植自 AE CEP「自动化图层工具集」cardScale.jsx
//
// 选中卡片图层后执行：创建/复用「鼠标控制器」Null，
// 每个卡片的缩放挂表达式——离控制器越近放大越多，
// 移出影响半径后回到最小缩放。拖动控制器即"鼠标悬停"效果，
// 对控制器位置打关键帧可做巡游动画。
//
// 引擎适配说明（相对 AE 原版）：
//   - AE 原版把参数存在控制器特效滑块上；Friction 无特效滑块，
//     参数在生成时写入表达式常量，改参数后重新执行即可覆盖
//   - AE 原版"平滑时间"读 value 当上帧状态实现低通滤波，实际是
//     恒定偏移 bug（见 linearCarousel.js 注释），本版未移植
//   - 缩放单位为分数（1.0 = 100%）
//   - 原版自动导入 mouse.svg 鼠标图标：脚本引擎暂无文件导入 API，
//     可手动导入鼠标图标图层后为其挂位置表达式跟随控制器（见帮助）

(function () {
    var SCRIPT_NAME = "卡片缩放";
    var CTRL_NAME = "鼠标控制器";

    var settings = {
        maxScale: 120,   // 最大缩放 %
        minScale: 50,    // 最小缩放 %
        radius: 250,     // 影响半径 px
        curve: 1         // 0=线性 1=Smoothstep 2=EaseOut 3=Sine
    };

    var debugLog = [];
    function log(msg) { debugLog.push(msg); print(msg); if (debugLog.length > 300) debugLog.shift(); }

    function requireSelection() {
        var scene = app.activeScene;
        if (!scene) { alert("请先打开一个场景"); return null; }
        var sel = scene.selectedLayers();
        if (!sel || sel.length === 0) { alert("请先选择一个或多个卡片图层"); return null; }
        return { scene: scene, sel: sel };
    }

    function ensureController(scene) {
        var ctrl = scene.layer(CTRL_NAME);
        if (!ctrl) {
            ctrl = scene.addNull(CTRL_NAME);
            if (!ctrl) { log("创建控制器失败"); return null; }
            ctrl.property("position").setValue(
                [scene.width / 2, scene.height / 2]);
            log("已创建控制器: " + CTRL_NAME + " (画布中心)");
        } else {
            log("复用已存在的控制器: " + CTRL_NAME);
        }
        return ctrl;
    }

    function runCardScale() {
        var ctx = requireSelection();
        if (!ctx) return;
        var scene = ctx.scene;

        app.beginUndoGroup(SCRIPT_NAME);
        try {
            var ctrl = ensureController(scene);
            if (!ctrl) { alert("控制器创建失败"); return; }

            var maxS = settings.maxScale / 100;
            var minS = settings.minScale / 100;
            var radius = settings.radius;
            var curve = settings.curve;

            var bound = 0;
            for (var i = 0; i < ctx.sel.length; i++) {
                var layer = ctx.sel[i];
                if (layer.name === CTRL_NAME) continue;

                // 轴心居中于内容：视觉中心 = pos + pivot，
                // 缩放围绕中心，不产生位移
                var b = layer.bounds();
                if (!b || b.width <= 0 || b.height <= 0) {
                    log("跳过 " + layer.name + "：无法获取边界");
                    continue;
                }
                layer.setAnchorPoint([b.left + b.width / 2,
                                      b.top + b.height / 2]);
                var pivX = (b.left + b.width / 2).toFixed(2);
                var pivY = (b.top + b.height / 2).toFixed(2);

                // 距离 = 鼠标 → 卡片视觉中心；距离→强度→缩放
                var bindings =
                    "mp = " + CTRL_NAME + ".transform.translation;\n" +
                    "mx = transform.translation.x;\n" +
                    "my = transform.translation.y;\n";
                var script =
                    "var dx = mp[0] - (mx + " + pivX + ");\n" +
                    "var dy = mp[1] - (my + " + pivY + ");\n" +
                    "var d = Math.sqrt(dx * dx + dy * dy);\n" +
                    "var t = d < " + radius.toFixed(2) +
                    " ? 1 - d / " + radius.toFixed(2) + " : 0;\n" +
                    "var f;\n" +
                    "if (" + curve + " === 0) { f = t; }\n" +
                    "else if (" + curve + " === 1) { f = t * t * (3 - 2 * t); }\n" +
                    "else if (" + curve + " === 2) { f = 1 - Math.pow(1 - t, 3); }\n" +
                    "else { f = Math.sin(t * Math.PI / 2); }\n" +
                    "return " + minS + " + (" + maxS + " - " + minS + ") * f;";
                var err = layer.property("scalex").setExpression(bindings, script);
                if (err) { log(layer.name + " 缩放X表达式失败: " + err); continue; }
                err = layer.property("scaley").setExpression(bindings, script);
                if (err) { log(layer.name + " 缩放Y表达式失败: " + err); continue; }
                bound++;
            }
            log("绑定完成: " + bound + " 个卡片, 半径=" + radius +
                ", 缩放=" + settings.minScale + "%~" + settings.maxScale + "%");

            for (var k = 0; k < ctx.sel.length; k++) ctx.sel[k].selected = false;
            ctrl.selected = true;
        } catch (err) {
            log("执行出错: " + err);
            alert("执行出错: " + err);
        } finally {
            app.endUndoGroup();
        }
    }

    // 给手动导入的鼠标图标图层挂跟随表达式（X/Y 跟随控制器）
    function bindMouseIcon() {
        var scene = app.activeScene;
        if (!scene) { alert("请先打开一个场景"); return; }
        var sel = scene.selectedLayers();
        if (!sel || sel.length === 0) {
            alert("请先选中鼠标图标图层再点击此按钮");
            return;
        }
        app.beginUndoGroup("鼠标图标跟随");
        try {
            var ok = 0;
            for (var i = 0; i < sel.length; i++) {
                var layer = sel[i];
                var b = layer.bounds();
                if (!b || b.width <= 0) {
                    log("跳过 " + layer.name + "：无法获取边界");
                    continue;
                }
                layer.setAnchorPoint([b.left + b.width / 2,
                                      b.top + b.height / 2]);
                var pivX = (b.left + b.width / 2).toFixed(2);
                var pivY = (b.top + b.height / 2).toFixed(2);
                var err = layer.property("positionx").setExpression(
                    "cx = " + CTRL_NAME + ".transform.translation.x;\n",
                    "return cx - " + pivX + ";");
                if (err) { log(layer.name + " X跟随失败: " + err); continue; }
                err = layer.property("positiony").setExpression(
                    "cy = " + CTRL_NAME + ".transform.translation.y;\n",
                    "return cy - " + pivY + ";");
                if (err) { log(layer.name + " Y跟随失败: " + err); continue; }
                ok++;
            }
            log("鼠标图标跟随绑定: " + ok + " 个图层");
        } catch (err) {
            log("执行出错: " + err);
            alert("执行出错: " + err);
        } finally {
            app.endUndoGroup();
        }
    }

    function showHelp() {
        alert("使用方法：\n" +
              "1. 选中卡片图层 → 点击「绑定缩放」\n" +
              "2. 拖动「鼠标控制器」Null 靠近卡片 → 卡片放大\n\n" +
              "参数：\n" +
              "· 最大缩放：鼠标贴脸时的放大比例\n" +
              "· 最小缩放：远离鼠标时的缩放\n" +
              "· 影响半径：触发范围的像素半径\n" +
              "· 衰减曲线：距离→缩放强度的映射\n\n" +
              "鼠标图标：先手动导入鼠标 SVG/PNG 图层，\n" +
              "选中它后点「图标跟随」按钮，图标会自动\n" +
              "跟着控制器移动。\n\n" +
              "提示：改参数后重新点「绑定缩放」即可覆盖；\n" +
              "对控制器位置 K 关键帧可做鼠标巡游动画。");
    }

    registerPanel({
        title: SCRIPT_NAME, columns: 2,
        sliders: [
            { label: "最大%", id: "maxS", min: 100, max: 200, value: settings.maxScale, decimals: 0,
              tooltip: "鼠标靠近时的最大放大百分比", onChange: function (v) { settings.maxScale = v; } },
            { label: "最小%", id: "minS", min: 20, max: 120, value: settings.minScale, decimals: 0,
              tooltip: "远离鼠标时的缩小百分比", onChange: function (v) { settings.minScale = v; } },
            { label: "半径", id: "radius", min: 50, max: 1000, value: settings.radius, decimals: 0,
              tooltip: "影响范围（像素半径）", onChange: function (v) { settings.radius = v; } }
        ],
        combos: [
            { label: "衰减", id: "curve", options: ["线性", "Smoothstep", "EaseOut", "Sine"], index: settings.curve,
              tooltip: "距离→缩放强度的映射曲线",
              onChange: function (i) { settings.curve = i; } }
        ],
        extraButtons: [
            { label: "▶ 绑定缩放", tooltip: "给选中卡片挂缩放表达式", onClick: runCardScale },
            { label: "图标跟随", tooltip: "让选中的鼠标图标图层跟随控制器", onClick: bindMouseIcon },
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
    registerCommand("卡片缩放: 绑定", runCardScale);
})();
