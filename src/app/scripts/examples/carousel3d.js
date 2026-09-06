// 3D轮播（X轴/Y轴）- 移植自 AE CEP「自动化图层工具集」
// xAxisCarousel.jsx / yAxisCarousel.jsx
//
// 选中图层后执行：图层启用 3D，沿圆环排布（X轴轮播=环在 Y-Z
// 竖直平面；Y轴轮播=环在 X-Z 水平面，顶视图看是一个圆圈），
// 绕轴旋转由「轮播控制器3D」Null 的「旋转」属性驱动——K 控制
// 器旋转即整环转动。建议配摄像机图层取景（图层已自动开 3D）。
//
// 参数存放（AE 滑块控制特效的 Friction 对应物）：
//   直径/间隔 存在控制器「properties」自定义属性上——时间轴
//   可调可 K 帧，面板滑杆实时写入。
//   整环旋转 = 控制器「旋转」属性（原生可 K 帧，核心动画入口）
//   轴向/朝向 = 生成时烤入，改后需重新生成
//
// 引擎适配说明：
//   - 位置表达式按场景坐标计算，卡片请放场景顶层（与控制器
//     同层级），嵌套在变换过的组内会偏差
//   - bindings 区只接受属性路径/$frame/$value/$scene.*，常量
//     烤进 script；$frame 绑定=换帧信号生死线，必须带
//   - 角度单位为度，位置为像素，与 AE 一致

(function () {
    var SCRIPT_NAME = "3D轮播";
    var CTRL_NAME = "轮播控制器3D";
    var P = { DIA: "直径", SPACING: "间隔" };

    var settings = {
        axis: 1,        // 0=X轴（竖直环） 1=Y轴（水平环）
        diameter: 1600,
        spacing: 0,     // 角度间隔，0=自动均分 360/n
        face: 0         // 0=朝向圆心（外翻） 1=固定朝向
    };

    var debugLog = [];
    function log(msg) { debugLog.push(msg); print(msg); if (debugLog.length > 300) debugLog.shift(); }

    function requireSelection() {
        var scene = app.activeScene;
        if (!scene) { alert("请先打开一个场景"); return null; }
        var sel = scene.selectedLayers();
        if (!sel || sel.length === 0) { alert("请至少选择一个图层"); return null; }
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

    function runCarousel() {
        var ctx = requireSelection();
        if (!ctx) return;
        var scene = ctx.scene;

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

            var spacing = settings.spacing > 0
                ? settings.spacing : 360 / n;

            var ctrl = scene.layer(CTRL_NAME);
            if (!ctrl) {
                ctrl = scene.addNull(CTRL_NAME);
                if (!ctrl) { alert("控制器创建失败"); return; }
                ctrl.set3DEnabled(true);
                log("已创建控制器: " + CTRL_NAME);
            } else {
                log("复用已存在的控制器: " + CTRL_NAME);
            }
            ctrl.property("position").setValue(
                [scene.width / 2, scene.height / 2]);
            ctrl.numberProperty(P.DIA, settings.diameter).setValue(settings.diameter);
            ctrl.numberProperty(P.SPACING, spacing).setValue(spacing);

            var isY = settings.axis === 1;
            var faceOut = settings.face === 0;

            var bound = 0;
            for (var k = 0; k < n; k++) {
                var layer = layers[k];
                layer.set3DEnabled(true);

                var b = layer.bounds();
                if (!b || b.width <= 0 || b.height <= 0) {
                    log("跳过 " + layer.name + "：无法获取边界");
                    continue;
                }
                layer.setAnchorPoint([b.left + b.width / 2,
                                      b.top + b.height / 2]);
                var pivX = (b.left + b.width / 2).toFixed(2);
                var pivY = (b.top + b.height / 2).toFixed(2);
                var idxDeg = k;

                // 公共绑定：换帧信号 + 控制器旋转/位置/Z + 环参数
                var bind =
                    "frame = $frame;\n" +
                    "rot = " + CTRL_NAME + ".transform.rotation;\n" +
                    "cp = " + CTRL_NAME + ".transform.translation;\n" +
                    "cz = " + CTRL_NAME + ".transform.3D position Z;\n" +
                    "rd = " + CTRL_NAME + ".properties." + P.DIA + ";\n" +
                    "sp = " + CTRL_NAME + ".properties." + P.SPACING + ";";
                // 角度→位置（与 AE 原版同式：sin/-cos，半径=直径/2）
                var ringXY =
                    "var a = (rot + " + idxDeg + " * sp) * Math.PI / 180;\n" +
                    "var s = (rd / 2) * Math.sin(a);\n";
                var err = layer.property("positionx").setExpression(bind,
                    isY ? ringXY + "return cp[0] + s - " + pivX + ";"
                        : ringXY + "return cp[0] - " + pivX + ";");
                if (err) { log(layer.name + " X表达式失败: " + err); continue; }

                err = layer.property("positiony").setExpression(bind,
                    isY ? "return cp[1] - " + pivY + ";"
                        : ringXY + "return cp[1] + s - " + pivY + ";");
                if (err) { log(layer.name + " Y表达式失败: " + err); continue; }

                err = layer.property("zposition").setExpression(bind,
                    "var a = (rot + " + idxDeg + " * sp) * Math.PI / 180;\n" +
                    "return cz - (rd / 2) * Math.cos(a);");
                if (err) { log(layer.name + " Z表达式失败: " + err); continue; }

                // 朝向：外翻=卡片随环角旋转；固定=保持 0
                var rotExpr = faceOut
                    ? "return rot + " + idxDeg + " * sp;"
                    : "return 0;";
                err = layer.property(isY ? "rotationy" : "rotationx")
                          .setExpression(bind, rotExpr);
                if (err) { log(layer.name + " 旋转表达式失败: " + err); continue; }

                // 生效值回读：X/Y/Z 应落在半径圆环上
                var pv = layer.property("position").effectiveValue();
                var zv = layer.property("zposition").effectiveValue();
                log(layer.name + " 生效: 中心=[" +
                    (pv[0] + b.width / 2).toFixed(0) + ", " +
                    (pv[1] + b.height / 2).toFixed(0) + "] z=" +
                    zv.toFixed(0));
                bound++;
            }
            log((isY ? "Y轴" : "X轴") + "轮播生成: " + bound + "/" + n +
                " 图层" + (faceOut ? ", 朝向圆心" : ", 固定朝向"));
            log("动画入口：K「" + CTRL_NAME + "」的旋转属性；" +
                "调直径/间隔：面板滑杆实时或控制器 properties 行");

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
              "1. 选中若干图层（按时间轴顺序上环）\n" +
              "2. 选轴（X轴=竖直环 / Y轴=水平环）→「生成轮播」\n" +
              "   Y轴环在顶视图是一个圆圈，有 z 轴空间\n" +
              "3. K「轮播控制器3D」的「旋转」→ 整环转动\n" +
              "4. 建议添加摄像机图层取景（图层已自动开 3D）\n\n" +
              "参数（控制器 properties 行，可 K 帧）：\n" +
              "· 直径：圆环直径像素（面板滑杆实时）\n" +
              "· 间隔：相邻图层角度，0=自动均分 360/数量\n" +
              "· 朝向：圆心=卡片外翻随环角；固定=朝向不变\n" +
              "  （轴向/朝向改后需重新生成）\n\n" +
              "拖控制器位置=整体平移圆环；\n" +
              "卡片请放场景顶层（勿嵌套在变换过的组内）。");
    }

    registerPanel({
        title: SCRIPT_NAME, columns: 2,
        sliders: [
            { label: "直径", id: "dia", min: 200, max: 6000, value: settings.diameter, decimals: 0,
              tooltip: "圆环直径像素（实时写入控制器）",
              onChanging: function (v) { settings.diameter = v; writeProp(P.DIA, v); },
              onChange: function (v) { settings.diameter = v; writeProp(P.DIA, v); } },
            { label: "间隔°", id: "spacing", min: 0, max: 360, value: settings.spacing, decimals: 1,
              tooltip: "相邻图层角度间隔，0=自动均分（实时写入控制器）",
              onChanging: function (v) { settings.spacing = v; },
              onChange: function (v) { settings.spacing = v; if (v > 0) writeProp(P.SPACING, v); } }
        ],
        combos: [
            { label: "轴向", id: "axis", options: ["X轴(竖直环)", "Y轴(水平环)"], index: settings.axis,
              tooltip: "X轴=环在竖直平面；Y轴=环在水平平面（顶视图为圆圈）",
              onChange: function (i) { settings.axis = i; } },
            { label: "朝向", id: "face", options: ["圆心(外翻)", "固定"], index: settings.face,
              tooltip: "圆心=卡片随环角转动朝外；固定=朝向保持不变（重新生成生效）",
              onChange: function (i) { settings.face = i; } }
        ],
        extraButtons: [
            { label: "▶ 生成轮播", tooltip: "把选中图层排上 3D 圆环", onClick: runCarousel },
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
    registerCommand("3D轮播: 生成", runCarousel);
})();
