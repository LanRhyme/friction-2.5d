#version 330 core
in vec2 texCoord;
out vec4 fragColor;
uniform sampler2D tex;
uniform vec2 fromPt;
uniform vec2 toPt;
uniform float radius;
uniform float elasticity;

void main(void) {
    vec2 offset = toPt - fromPt;
    float r = max(radius, 0.001);
    float d = length(texCoord - toPt);
    vec2 uv = texCoord;

    if (d < r) {
        float w = pow(clamp(1.0 - d / r, 0.0, 1.0), max(elasticity, 0.01));
        uv = texCoord - offset * w;
    }

    fragColor = texture(tex, clamp(uv, 0.0, 1.0));
}
