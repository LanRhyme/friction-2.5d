#version 330 core
in vec2 texCoord;
out vec4 fragColor;
uniform sampler2D tex;
uniform float border;
uniform float edgeSharpness;
uniform float scale;
uniform float complexity;
uniform float evolution;

vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(hash2(i + vec2(0.0,0.0)), f - vec2(0.0,0.0)),
                   dot(hash2(i + vec2(1.0,0.0)), f - vec2(1.0,0.0)), u.x),
               mix(dot(hash2(i + vec2(0.0,1.0)), f - vec2(0.0,1.0)),
                   dot(hash2(i + vec2(1.0,1.0)), f - vec2(1.0,1.0)), u.x), u.y);
}

float fbm(vec2 p, int octaves) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
        if (i >= octaves) break;
        val += amp * noise(p * freq);
        freq *= 2.0;
        amp *= 0.5;
    }
    return val;
}

void main(void) {
    if (border <= 0.001) {
        fragColor = texture(tex, texCoord);
        return;
    }

    ivec2 sz = textureSize(tex, 0);
    vec2 texSize = max(vec2(1.0), vec2(sz));
    vec2 pixelPos = texCoord * texSize;

    int oct = clamp(int(complexity), 1, 5);
    float sc = max(scale * 2.0, 4.0);
    vec2 noiseCoord = (pixelPos / sc) + vec2(evolution * 0.1, evolution * 0.07);
    float n = fbm(noiseCoord, oct);

    vec2 disp = vec2(n, -n) * (border * 0.003);
    vec2 sampleUv = clamp(texCoord + disp, 0.0, 1.0);
    vec4 col = texture(tex, sampleUv);

    float sharpness = max(edgeSharpness, 0.5);
    float edgeWidth = max(0.04, 1.5 / sharpness);
    float threshold = 0.5 - (border * 0.006) * n;
    float erodedAlpha = smoothstep(threshold - edgeWidth, threshold + edgeWidth, col.a);

    col.rgb *= erodedAlpha;
    col.a = erodedAlpha * col.a;

    fragColor = col;
}
