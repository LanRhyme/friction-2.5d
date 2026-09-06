// 卡片缩放（模拟鼠标）- 移植自 AE CEP「自动化图层工具集」cardScale.jsx
//
// 选中卡片图层后执行：创建/复用「鼠标控制器」Null，
// 每个卡片的缩放挂表达式——离控制器越近放大越多，
// 移出影响半径后回到最小缩放。拖动控制器即"鼠标悬停"效果，
// 对控制器位置打关键帧可做巡游动画。
//
// 参数存放（AE 滑块控制特效的 Friction 对应物）：
//   最大缩放/最小缩放/影响半径/衰减 存在控制器「properties」
//   自定义属性上——时间轴可调可 K 帧，面板滑杆实时写入。
//
// 引擎适配说明：
//   - AE 原版"平滑时间"低通滤波是 value 误用 bug，未移植
//   - 缩放单位为分数（1.0 = 100%），properties 里存百分比
//   - 鼠标图标：脚本引擎暂无文件导入 API，手动导入图标图层后
//     用「图标跟随」按钮绑定跟随控制器

(function () {
    var SCRIPT_NAME = "卡片缩放";
    var CTRL_NAME = "鼠标控制器";
    var P = { MAX: "最大缩放", MIN: "最小缩放",
              RADIUS: "影响半径", CURVE: "衰减" };

    var settings = {
        maxScale: 120, minScale: 50, radius: 250, curve: 1
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

    function findCtrl() {
        var scene = app.activeScene;
        return scene ? scene.layer(CTRL_NAME) : null;
    }

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
            ctrl.property("position").setValue(
                [scene.width / 2, scene.height / 2]);
            log("已创建控制器: " + CTRL_NAME + " (画布中心)");
        } else {
            log("复用已存在的控制器: " + CTRL_NAME);
        }
        ctrl.numberProperty(P.MAX, settings.maxScale).setValue(settings.maxScale);
        ctrl.numberProperty(P.MIN, settings.minScale).setValue(settings.minScale);
        ctrl.numberProperty(P.RADIUS, settings.radius).setValue(settings.radius);
        ctrl.numberProperty(P.CURVE, settings.curve).setValue(settings.curve);
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

            var bound = 0;
            for (var i = 0; i < ctx.sel.length; i++) {
                var layer = ctx.sel[i];
                if (layer.name === CTRL_NAME) continue;

                // 轴心居中于内容：视觉中心 = pos + pivot，
                // 缩放围绕中心不产生位移
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
                    "frame = $frame;\n" +
                    "mp = " + CTRL_NAME + ".transform.translation;\n" +
                    "mx = transform.translation.x;\n" +
                    "my = transform.translation.y;\n" +
                    "rg = " + CTRL_NAME + ".properties." + P.RADIUS + ";\n" +
                    "mxs = " + CTRL_NAME + ".properties." + P.MAX + ";\n" +
                    "mns = " + CTRL_NAME + ".properties." + P.MIN + ";\n" +
                    "cv = " + CTRL_NAME + ".properties." + P.CURVE + ";";
                var script =
                    "var dx = mp[0] - (mx + " + pivX + ");\n" +
                    "var dy = mp[1] - (my + " + pivY + ");\n" +
                    "var d = Math.sqrt(dx * dx + dy * dy);\n" +
                    "var t = d < rg ? 1 - d / rg : 0;\n" +
                    "var f;\n" +
                    "if (cv < 0.5) { f = t; }\n" +
                    "else if (cv < 1.5) { f = t * t * (3 - 2 * t); }\n" +
                    "else if (cv < 2.5) { f = 1 - Math.pow(1 - t, 3); }\n" +
                    "else { f = Math.sin(t * Math.PI / 2); }\n" +
                    "return mns / 100 + (mxs / 100 - mns / 100) * f;";
                var err = layer.property("scalex").setExpression(bindings, script);
                if (err) { log(layer.name + " 缩放X表达式失败: " + err); continue; }
                err = layer.property("scaley").setExpression(bindings, script);
                if (err) { log(layer.name + " 缩放Y表达式失败: " + err); continue; }

                var sv = layer.property("scalex").effectiveValue();
                log(layer.name + " 绑定成功, 当前缩放=" + (sv * 100).toFixed(0) + "%");
                bound++;
            }
            log("绑定完成: " + bound + " 个卡片");

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
        if (!scene.layer(CTRL_NAME)) {
            alert("请先执行一次「绑定缩放」创建控制器");
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
                    "frame = $frame;\n" +
                    "cx = " + CTRL_NAME + ".transform.translation.x;",
                    "return cx - " + pivX + ";");
                if (err) { log(layer.name + " X跟随失败: " + err); continue; }
                err = layer.property("positiony").setExpression(
                    "frame = $frame;\n" +
                    "cy = " + CTRL_NAME + ".transform.translation.y;",
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
              "参数（控制器 properties 行，可 K 帧）：\n" +
              "· 最大缩放：鼠标贴脸时的放大百分比\n" +
              "· 最小缩放：远离鼠标时的缩小百分比\n" +
              "· 影响半径：触发范围的像素半径\n" +
              "· 衰减：0=线性 1=Smoothstep 2=EaseOut 3=Sine\n\n" +
              "面板滑杆拖动即实时写入控制器属性；\n" +
              "生成时面板值会覆盖控制器上的同名参数。\n\n" +
              "鼠标图标：先手动导入鼠标 SVG/PNG 图层，\n" +
              "选中它后点「图标跟随」按钮自动跟着控制器移动。");
    }

    registerPanel({
        title: SCRIPT_NAME, columns: 2,
        sliders: [
            { label: "最大%", id: "maxS", min: 100, max: 200, value: settings.maxScale, decimals: 0,
              tooltip: "鼠标靠近时的最大放大百分比（实时）",
              onChanging: function (v) { settings.maxScale = v; writeProp(P.MAX, v); },
              onChange: function (v) { settings.maxScale = v; writeProp(P.MAX, v); } },
            { label: "最小%", id: "minS", min: 20, max: 120, value: settings.minScale, decimals: 0,
              tooltip: "远离鼠标时的缩小百分比（实时）",
              onChanging: function (v) { settings.minScale = v; writeProp(P.MIN, v); },
              onChange: function (v) { settings.minScale = v; writeProp(P.MIN, v); } },
            { label: "半径", id: "radius", min: 50, max: 1000, value: settings.radius, decimals: 0,
              tooltip: "影响范围像素半径（实时）",
              onChanging: function (v) { settings.radius = v; writeProp(P.RADIUS, v); },
              onChange: function (v) { settings.radius = v; writeProp(P.RADIUS, v); } }
        ],
        combos: [
            { label: "衰减", id: "curve", options: ["线性", "Smoothstep", "EaseOut", "Sine"], index: settings.curve,
              tooltip: "距离→缩放强度的映射曲线（实时写入控制器）",
              onChange: function (i) { settings.curve = i; writeProp(P.CURVE, i); } }
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
