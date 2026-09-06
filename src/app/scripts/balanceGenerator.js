// 天平生成器 — 移植自 AE 脚本「天平生成器.jsx」
//
// 选三个图层（秤杆/左平台/右平台，按名称关键词自动识别），
// 创建「天平控制器」空对象 + 「天平角度」数值属性（AE 滑块效果等价）：
//   秤杆旋转   <- 表达式读取控制器角度
//   平台       <- 变换父级绑到秤杆（保持视觉位置），自身旋转 = -秤杆旋转（始终水平）
// 对控制器的「天平角度」属性 K 帧即可记录天平动画；面板滑杆实时联动。
(function () {
    var debugLog = [];
    function log(msg) {
        debugLog.push(msg);
        print(msg);
        if (debugLog.length > 300) debugLog.shift();
    }

    var CTRL_LAYER_NAME = "天平控制器";
    var CTRL_PROP_NAME = "天平角度";
    var PLACEHOLDER = "（无图层）";

    // 自动识别图层名关键词（按顺序匹配，AE 原版同款 + 左/右/杆 单字）
    var BEAM_KEYWORDS = ["秤杆", "天平杆", "横梁", "杆", "beam"];
    var LEFT_KEYWORDS = ["左平台", "左盘", "左托盘", "左", "left"];
    var RIGHT_KEYWORDS = ["右平台", "右盘", "右托盘", "右", "right"];

    var state = { beam: null, left: null, right: null, angle: 0 };

    function nameMatchesKeywords(name, keywords) {
        var lower = String(name).toLowerCase();
        for (var i = 0; i < keywords.length; i++) {
            if (lower.indexOf(keywords[i].toLowerCase()) >= 0) return true;
        }
        return false;
    }

    function layerNames() {
        var scene = app.activeScene;
        if (!scene) { return null; }
        var layers = scene.layers();
        var names = [];
        for (var i = 0; i < layers.length; i++) {
            try { names.push(layers[i].name); } catch (e) {}
        }
        return names;
    }

    // 选下拉索引：上次选择 > 关键词自动识别 > 顺序兜底（AE 三级回退同款）
    function pickIndex(names, prev, keywords, fallback) {
        if (prev && prev !== PLACEHOLDER) {
            var p = names.indexOf(prev);
            if (p >= 0) { return p; }
        }
        for (var i = 0; i < names.length; i++) {
            if (nameMatchesKeywords(names[i], keywords)) { return i; }
        }
        if (fallback < names.length) { return fallback; }
        return names.length > 0 ? names.length - 1 : -1;
    }

    function showPlaceholder(msg) {
        updateCombo("beam", [PLACEHOLDER], 0);
        updateCombo("left", [PLACEHOLDER], 0);
        updateCombo("right", [PLACEHOLDER], 0);
        state.beam = state.left = state.right = null;
        log(msg);
    }

    function refreshLayerList() {
        var names = layerNames();
        if (!names) { showPlaceholder("刷新图层列表: 无活动场景"); return; }
        log("刷新图层列表: 场景=" + app.activeScene.name
            + " 图层数=" + names.length);
        if (names.length === 0) {
            showPlaceholder("刷新图层列表: 场景无图层");
            return;
        }
        var bi = pickIndex(names, state.beam, BEAM_KEYWORDS, 0);
        var li = pickIndex(names, state.left, LEFT_KEYWORDS, 1);
        var ri = pickIndex(names, state.right, RIGHT_KEYWORDS, 2);
        updateCombo("beam", names, bi);
        updateCombo("left", names, li);
        updateCombo("right", names, ri);
        state.beam = names[bi];
        state.left = names[li];
        state.right = names[ri];
        log("自动识别: 秤杆=" + state.beam
            + " | 左平台=" + state.left
            + " | 右平台=" + state.right);
    }

    // 表达式绑定路径以 "." 分段，图层名含点号会解析错乱
    function nameSafeForBinding(name) {
        return String(name).indexOf(".") < 0;
    }

    // 平台挂到秤杆：变换父级继承（AE pick whip 语义，任意图层类型可用），
    // 记录世界位置绑定后补偿，再加反向旋转表达式（平台始终水平）
    // $frame 生死线：表达式引擎对"静态"表达式会按恒值缓存，
    // 不绑 $frame 拖动滑杆值变了画面不动（cardScale/轮播同款铁律）
    function parentPlatform(platform, beam, label) {
        var world = platform.worldPosition();
        if (!world) { throw label + " 读取世界位置失败"; }
        log(label + " [" + platform.name + "] 世界位置 ["
            + Number(world[0]).toFixed(1) + ", "
            + Number(world[1]).toFixed(1) + "]");
        if (!platform.setTransformParent(beam)) {
            throw label + " 父级绑定失败";
        }
        if (!platform.setWorldPosition(world)) {
            throw label + " 位置补偿失败";
        }
        var err = platform.rotation().setExpression(
            "frame = $frame;\n"
            + "rot = " + beam.name + ".transform.rotation;",
            "return -rot;");
        if (err) { throw label + " 反向旋转表达式失败: " + err; }
        log(label + " 已挂到秤杆 + 反向旋转表达式");
    }

    function applyBalance() {
        log("=== 应用天平生成器 ===");
        var scene = app.activeScene;
        if (!scene) { alert("请先打开一个场景"); return; }
        if (!state.beam || !state.left || !state.right
            || state.beam === PLACEHOLDER
            || state.left === PLACEHOLDER
            || state.right === PLACEHOLDER) {
            alert("请先选择图层（必要时点击 刷新图层列表）");
            return;
        }
        var beam = scene.layer(state.beam);
        var left = scene.layer(state.left);
        var right = scene.layer(state.right);
        if (!beam || !left || !right) {
            alert("未找到所选图层，请点击 刷新图层列表");
            return;
        }
        if (state.beam === state.left || state.beam === state.right
            || state.left === state.right) {
            alert("三个图层必须互不相同");
            return;
        }
        if (!nameSafeForBinding(state.beam)) {
            alert("秤杆图层名含 \".\"，表达式绑定无法解析，请重命名后重试");
            return;
        }

        log("秤杆: " + beam.name + " | 左平台: " + left.name
            + " | 右平台: " + right.name);
        app.beginUndoGroup("应用天平生成器");
        try {
            // 1. 控制器空对象（查找或新建，AE addNull 等价）
            var ctrl = scene.layer(CTRL_LAYER_NAME);
            var created = false;
            if (!ctrl) {
                ctrl = scene.addNull(CTRL_LAYER_NAME);
                created = !!ctrl;
            }
            if (!ctrl) { throw "无法创建控制器 " + CTRL_LAYER_NAME; }
            log((created ? "创建" : "复用") + "控制器: " + CTRL_LAYER_NAME);

            // 2. 角度数值属性（AE 滑块效果等价）：
            //    已有键则当前帧自动 K 帧，否则直接设值
            //    （numKeys 被 Q_PROPERTY 遮蔽，只能属性形式读取）
            var slider = ctrl.numberProperty(CTRL_PROP_NAME, 0);
            if (!slider) { throw "无法创建数值属性 " + CTRL_PROP_NAME; }
            var angle = state.angle;
            if (slider.numKeys > 0) {
                slider.setValueAtFrame(scene.currentFrame, angle);
            } else {
                slider.setValue(angle);
            }

            // 3. 秤杆旋转表达式 <- 控制器角度
            //    （$frame 生死线：不绑会被当恒值缓存，拖滑杆画面不动）
            var beamRot = beam.rotation();
            if (!beamRot) { throw "秤杆无旋转属性"; }
            var err = beamRot.setExpression(
                "frame = $frame;\n"
                + "ang = " + CTRL_LAYER_NAME + ".properties."
                + CTRL_PROP_NAME + ";", "return ang;");
            if (err) { throw "秤杆表达式失败: " + err; }
            log("秤杆旋转已绑定 " + CTRL_LAYER_NAME + "."
                + CTRL_PROP_NAME + " = " + angle + "°");

            // 4. 平台挂到秤杆（保持视觉位置）+ 反向旋转
            parentPlatform(left, beam, "左平台");
            parentPlatform(right, beam, "右平台");

            log("应用完成！对控制器 [" + CTRL_LAYER_NAME + "] 的 "
                + CTRL_PROP_NAME + " 属性 K 帧即可记录天平动画");
        } catch (err) {
            log("应用失败: " + err);
            alert("应用失败: " + err);
        } finally {
            app.endUndoGroup();
        }
    }

    // 面板滑杆 -> 实时写控制器角度（未应用过则静默返回；
    // 滑块已 K 帧时在当前帧自动打关键帧，AE 原版同款）
    function updateBeamRotation(v) {
        var scene = app.activeScene;
        if (!scene) { return; }
        var ctrl = scene.layer(CTRL_LAYER_NAME);
        if (!ctrl) { return; }
        var slider = ctrl.numberProperty(CTRL_PROP_NAME, v);
        if (!slider) { return; }
        try {
            if (slider.numKeys > 0) {
                slider.setValueAtFrame(scene.currentFrame, v);
                log("天平角度 " + v + "° -> 第 " + scene.currentFrame + " 帧关键帧");
            } else {
                slider.setValue(v);
                log("天平角度 -> " + v + "°");
            }
        } catch (e) {
            log("更新角度失败: " + e);
        }
    }

    function setAngle(v) {
        state.angle = Math.round(v);
        updateBeamRotation(state.angle);
    }

    registerPanel({
        title: "天平生成器",
        columns: 3,
        combos: [
            { label: "秤杆:", id: "beam", options: [PLACEHOLDER], index: 0,
              onChange: function (i, text) { state.beam = text; } },
            { label: "左平台:", id: "left", options: [PLACEHOLDER], index: 0,
              onChange: function (i, text) { state.left = text; } },
            { label: "右平台:", id: "right", options: [PLACEHOLDER], index: 0,
              onChange: function (i, text) { state.right = text; } }
        ],
        sliders: [{
            label: "天平角度(度)", id: "angle",
            min: -90, max: 90, value: 0, decimals: 0,
            tooltip: "应用后拖动实时生效；已 K 帧时在当前帧自动打关键帧；"
                   + "也可直接在时间轴对控制器「" + CTRL_PROP_NAME + "」属性 K 帧",
            onChanging: setAngle,
            onChange: setAngle
        }],
        buttons: [
            { label: "刷新图层列表", tooltip: "重新读取当前场景的图层名称",
              onClick: refreshLayerList }
        ],
        extraButtons: [
            { label: "▶ 应用",
              tooltip: "秤杆绑定控制器角度；平台挂到秤杆并反向旋转（保持水平）",
              onClick: applyBalance },
            { label: "☰ 调试日志", tooltip: "查看并复制调试日志",
              onClick: function () {
                  alert(debugLog.length > 0 ? debugLog.join("\n") : "暂无日志");
              } }
        ]
    });

    // 启动时先试一次填充（此时常无场景，静默）；之后由用户点「刷新图层列表」
    refreshLayerList();
})();
