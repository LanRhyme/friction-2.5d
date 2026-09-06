// 轮播 - 移植自 AE「自动化图层工具集」（linearCarousel / xAxis /
// yAxis Carousel）+「轮播卡片.jsx」弧形经验
// (ae-expert-knowledge-base/common-issues/3d-carousel-arc-layout-pitfalls.md)
//
// ===== 工作流（与 AE 原版一致）=====
// 面板只管"一键生成"：点一种排布按钮 → 建控制器 Null → 控制器
// properties 组写入默认参数 → 给选中图层挂表达式 → 选中控制器。
// 之后所有操控在 时间轴/属性面板 的控制器 properties 组上：
// 拖值实时预览、右键 K 关键帧——表达式自动跟随，面板不再参与。
// 重新生成时已存在的参数保留当前值（AE ensureController 语义）。
//
// 排布：
//   水平环 = 弧形轮播（X-Z 平面，顶视图圆弧，中间最近最大两侧
//            后退渐小，AE Y轴轮播 + 知识库弧形默认40°）
//   竖直环 = 摩天轮（Y-Z 平面，AE X轴轮播）
//   线性   = 横向滑动（拖/K 控制器 X，靠近画布中心越大）
//
// 控制器参数（properties 组，全部可K帧）：
//   环形：直径1600 间隔40 缩放衰减10 朝向增强100
//         波浪振幅0 波浪频率0.5 透明度衰减0
//   线性：间距400 最大缩放150 最小缩放50 影响范围600 衰减1
//   环形动画入口=控制器「旋转」属性；线性=控制器X位置
//
// 引擎适配：表达式挂标量子轴(positionx/scalex)；bindings 只接受
// 属性路径/$frame/$value/$scene.*，常量烤进script；$frame生死线；
// 朝向符号两轴相反(水平环rotY=-a、竖直环rotX=+a，由
// get3DTransformAtFrame 推导)；缩放分数1.0=100%，properties 存
// AE 惯例百分比；卡片放场景顶层，控制器名勿含点号。

(function () {
    var CTRL_RING = "轮播控制器";
    var CTRL_LINEAR = "线性轮播控制器";

    // 生成时的默认值（仅创建时写入，已存在保留用户/时间轴值）
    var RING_PROPS = [
        { name: "直径", v: 1600 },
        { name: "间隔", v: 40 },
        { name: "缩放衰减", v: 10 },
        { name: "朝向增强", v: 100 },
        { name: "波浪振幅", v: 0 },
        { name: "波浪频率", v: 0.5 },
        { name: "透明度衰减", v: 0 }
    ];
    var LINEAR_PROPS = [
        { name: "间距", v: 400 },
        { name: "最大缩放", v: 150 },
        { name: "最小缩放", v: 50 },
        { name: "影响范围", v: 600 },
        { name: "衰减", v: 1 }
    ];

    var debugLog = [];
    function log(msg) { debugLog.push(msg); print(msg); if (debugLog.length > 300) debugLog.shift(); }
    var boundNames = [];

    function requireSelection() {
        var scene = app.activeScene;
        if (!scene) { alert("请先打开一个场景"); return null; }
        var sel = scene.selectedLayers();
        if (!sel || sel.length === 0) { alert("请先选择一个或多个图层"); return null; }
        return { scene: scene, sel: sel };
    }

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

    // ---- 线性（控制器：线性轮播控制器）----------------------------

    function bindLinear(layer, orderIdx, n, uni) {
        var C = CTRL_LINEAR;
        var centerOffset = orderIdx - (n - 1) / 2;
        var pivX = uni.pivot[0].toFixed(2);
        var pivY = uni.pivot[1].toFixed(2);

        var err = layer.property("positionx").setExpression(
            "frame = $frame;\n" +
            "cx = " + C + ".transform.translation.x;\n" +
            "sp = " + C + ".properties.间距;",
            "return cx + (" + centerOffset.toFixed(4) + ") * sp - " + pivX + ";");
        if (err) return "位置X: " + err;

        err = layer.property("positiony").setExpression(
            "frame = $frame;\n" +
            "cy = " + C + ".transform.translation.y;",
            "return cy - " + pivY + ";");
        if (err) return "位置Y: " + err;

        var scaleBindings =
            "frame = $frame;\n" +
            "mx = transform.translation.x;\n" +
            "sc = $scene.width;\n" +
            "rg = " + C + ".properties.影响范围;\n" +
            "mxs = " + C + ".properties.最大缩放;\n" +
            "mns = " + C + ".properties.最小缩放;\n" +
            "cv = " + C + ".properties.衰减;";
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

    // ---- 环形（控制器：轮播控制器）--------------------------------
    // 性能铁律：每条表达式只绑它用到的属性——拖任何一个参数时
    // 失效扇出最小化（全量绑定会让一次拖参=全部35条表达式失效=
    // 5张大图每步全量重栅格化，画布极卡）；纯静态输入(缩放/透明度)
    // 不绑 $frame，消除换帧空转

    function bindRing(layer, orderIdx, n, uni, isY) {
        var C = CTRL_RING;
        var pivX = uni.pivot[0].toFixed(2);
        var pivY = uni.pivot[1].toFixed(2);
        var centerIdx = (n - 1) / 2;
        var idx = orderIdx - centerIdx;   // 对称偏移，烤入表达式

        var B = {
            frame: "frame = $frame;\n",
            rot:   "rot = " + C + ".transform.rotation;\n",
            cp:    "cp = " + C + ".transform.translation;\n",
            cz:    "cz = " + C + ".transform.3D position Z;\n",
            rd:    "rd = " + C + ".properties.直径;\n",
            sp:    "sp = " + C + ".properties.间隔;\n",
            dr:    "dr = " + C + ".properties.缩放衰减;\n",
            en:    "en = " + C + ".properties.朝向增强;\n",
            am:    "am = " + C + ".properties.波浪振幅;\n",
            fq:    "fq = " + C + ".properties.波浪频率;\n",
            fd:    "fd = " + C + ".properties.透明度衰减;"
        };

        // 角度 = 对称序号×间隔 + 旋转；z = -R·cos：圆心=控制器、弧朝镜头
        var ringXY =
            "var a = (rot + (" + idx.toFixed(4) + ") * sp) * Math.PI / 180;\n" +
            "var s = (rd / 2) * Math.sin(a);\n";
        var wave = "var w = am * Math.sin((" + idx.toFixed(4) + ") * fq);\n";

        // 水平环: X=环(R·sin)、Y=波浪；竖直环: X=波浪、Y=环
        err = layer.property("positionx").setExpression(
            B.frame + (isY ? (B.rot + B.rd + B.sp) : (B.am + B.fq)) + B.cp,
            (isY ? ringXY : wave) +
            "return cp[0] + " + (isY ? "s" : "w") + " - " + pivX + ";");
        if (err) return "位置X: " + err;

        err = layer.property("positiony").setExpression(
            B.frame + (isY ? (B.am + B.fq) : (B.rot + B.rd + B.sp)) + B.cp,
            (isY ? wave : ringXY) +
            "return cp[1] + " + (isY ? "w" : "s") + " - " + pivY + ";");
        if (err) return "位置Y: " + err;

        err = layer.property("zposition").setExpression(
            B.frame + B.rot + B.cz + B.rd + B.sp,
            "var a = (rot + (" + idx.toFixed(4) + ") * sp) * Math.PI / 180;\n" +
            "return cz - (rd / 2) * Math.cos(a);");
        if (err) return "位置Z: " + err;

        // 朝向=内翻朝环心（AE"朝向摄像机"语义）。
        // 两轴符号相反（由 get3DTransformAtFrame 单应矩阵推导）：
        // 水平环(绕Y) rotY=-a；竖直环(绕X) rotX=+a
        var rotSign = isY ? "-" : "";
        err = layer.property(isY ? "rotationy" : "rotationx")
                  .setExpression(B.frame + B.rot + B.sp + B.en,
            "return " + rotSign + "(rot + (" + idx.toFixed(4) + ") * sp) * en / 100;");
        if (err) return "朝向: " + err;

        // 缩放衰减：100 - |对称序号|×衰减%（静态输入，不绑frame）
        var scaleScript =
            "var v = 100 - Math.abs(" + idx.toFixed(4) + ") * dr;\n" +
            "return v / 100;";
        err = layer.property("scalex").setExpression(B.dr, scaleScript);
        if (err) return "缩放X: " + err;
        err = layer.property("scaley").setExpression(B.dr, scaleScript);
        if (err) return "缩放Y: " + err;

        // 透明度衰减（0=关闭；animator 范围 0..100；静态输入，不绑frame）
        err = layer.property("opacity").setExpression(B.fd,
            "var v = 100 - Math.abs(" + idx.toFixed(4) + ") * fd;\n" +
            "return v < 0 ? 0 : v;");
        if (err) return "透明度: " + err;
        return "";
    }

    // ---- 主入口（mode: 0=线性 1=水平环 2=竖直环）-------------------

    function runCarousel(mode) {
        var ctx = requireSelection();
        if (!ctx) return;
        var scene = ctx.scene;
        sceneW = scene.width; sceneH = scene.height;
        var isLinear = mode === 0;

        app.beginUndoGroup("轮播");
        try {
            var ctrlName = isLinear ? CTRL_LINEAR : CTRL_RING;
            var layers = [];
            for (var i = 0; i < ctx.sel.length; i++) {
                if (ctx.sel[i].name === ctrlName) continue;
                layers.push(ctx.sel[i]);
            }
            layers.sort(function (a, b) { return a.index - b.index; });
            var n = layers.length;
            if (n === 0) { alert("除控制器外没有可选图层"); return; }

            // 控制器：查找或创建，参数只在新键时写默认值
            var ctrl = scene.layer(ctrlName);
            if (!ctrl) {
                ctrl = scene.addNull(ctrlName);
                if (!ctrl) { alert("控制器创建失败"); return; }
                log("已创建控制器: " + ctrlName);
            } else {
                log("复用控制器: " + ctrlName + "（已有参数保留当前值）");
            }
            ctrl.property("position").setValue(
                [scene.width / 2, scene.height / 2]);
            if (!isLinear) ctrl.set3DEnabled(true);
            var defs = isLinear ? LINEAR_PROPS : RING_PROPS;
            var propList = [];
            for (var d = 0; d < defs.length; d++) {
                var p = ctrl.numberProperty(defs[d].name, defs[d].v);
                if (p) propList.push(defs[d].name);
            }

            boundNames = [];
            var bound = 0;
            for (var k = 0; k < n; k++) {
                var layer = layers[k];
                if (!isLinear) layer.set3DEnabled(true);
                var uni = prepLayer(layer, isLinear);
                if (!uni) { log("跳过 " + layer.name + "：无法获取边界"); continue; }

                var err = isLinear
                    ? bindLinear(layer, k, n, uni)
                    : bindRing(layer, k, n, uni, mode === 1);
                if (err) { log(layer.name + " 表达式失败 " + err); continue; }

                logReadout(layer, uni, !isLinear);
                boundNames.push(layer.name);
                bound++;
            }
            var modeName = isLinear ? "线性"
                : (mode === 1 ? "水平环" : "竖直环");
            log("生成完成: " + bound + "/" + n + "（" + modeName + "）");
            log("实时调参：时间轴选中「" + ctrlName +
                "」→ properties 组（" + propList.join(" / ") + "），可K帧");
            log(isLinear
                ? "动画入口：K 控制器 X 位置"
                : "动画入口：K 控制器旋转（整弧绕环转动）");

            for (var j = 0; j < layers.length; j++) layers[j].selected = false;
            ctrl.selected = true;
        } catch (err) {
            log("执行出错: " + err);
            alert("执行出错: " + err);
        } finally {
            app.endUndoGroup();
        }
    }

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

    function recheck() {
        var scene = app.activeScene;
        if (!scene || boundNames.length === 0) {
            alert("还没有绑定记录，请先生成轮播");
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
        alert("使用方法（与 AE 原版一致，一键生成）：\n" +
              "1. 选中若干图层（按时间轴顺序）\n" +
              "2. 点「水平环」（弧形轮播，顶视图圆弧）/\n" +
              "   「竖直环」（摩天轮）/「线性」（横向滑动）\n" +
              "3. 生成后自动选中控制器——在时间轴展开它的\n" +
              "   properties 组直接拖参数：实时预览、可K关键帧\n\n" +
              "环形参数：直径 / 间隔(40=弧形,大值趋近整环) /\n" +
              "  缩放衰减% / 朝向增强%(0=固定,负=反向) /\n" +
              "  波浪振幅 / 波浪频率 / 透明度衰减%\n" +
              "线性参数：间距 / 最大缩放% / 最小缩放% /\n" +
              "  影响范围 / 衰减(0线性1平滑2正弦)\n\n" +
              "动画入口：环形=K 控制器「旋转」；线性=K 控制器X位置。\n" +
              "重新生成时已调过的参数保留当前值。\n" +
              "卡片请放场景顶层（勿嵌套在变换过的组内）。");
    }

    registerPanel({
        title: "轮播", columns: 2,
        buttons: [
            { label: "水平环", tooltip: "弧形轮播：X-Z平面圆弧，中间最近最大，K控制器旋转整环转动", onClick: function () { runCarousel(1); } },
            { label: "竖直环", tooltip: "摩天轮：Y-Z平面圆环，K控制器旋转整环转动", onClick: function () { runCarousel(2); } },
            { label: "线性", tooltip: "横向等距排开，拖/K控制器X左右滑动，近画布中心越大", onClick: function () { runCarousel(0); } },
            { label: "复查读数", tooltip: "回读所有已绑定卡片的表达式生效值", onClick: recheck }
        ],
        extraButtons: [
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
    registerCommand("轮播: 水平环", function () { runCarousel(1); });
    registerCommand("轮播: 竖直环", function () { runCarousel(2); });
    registerCommand("轮播: 线性", function () { runCarousel(0); });
})();
