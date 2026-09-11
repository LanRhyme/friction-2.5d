#version 330 core
in vec2 texCoord;
out vec4 fragColor;
uniform sampler2D tex;
uniform float progress;
uniform float pieces;
uniform float dispersion;
uniform float gravity;
uniform float rotation;
uniform float seed;

vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1 + seed * 0.1, 311.7 - seed * 0.1)),
             dot(p, vec2(269.5 + seed * 0.1, 183.3 + seed * 0.1)));
    return fract(sin(p) * 43758.5453123);
}

void main(void) {
    if (progress <= 0.0001) {
        fragColor = texture(tex, texCoord);
        return;
    }

    ivec2 sz = textureSize(tex, 0);
    vec2 texSize = max(vec2(1.0), vec2(sz));
    vec2 pixelPos = texCoord * texSize;

    // Determine grid resolution for Voronoi shards
    int countY = clamp(int(pieces), 4, 16);
    float cellSize = texSize.y / float(countY);
    int countX = int(ceil(texSize.x / cellSize));

    float t = progress * 0.01;
    vec2 center = texSize * 0.5;

    vec4 bestColor = vec4(0.0);
    float bestZ = -9999.0;
    bool found = false;

    // Search candidate shards
    for (int y = 0; y < 16; y++) {
        if (y >= countY) break;
        for (int x = 0; x < 28; x++) {
            if (x >= countX) break;

            vec2 cell = vec2(float(x), float(y));
            vec2 pt = hash2(cell * 3.17);
            vec2 shardRestCenter = (cell + 0.15 + 0.7 * pt) * cellSize;

            // Velocity & physical dispersion
            vec2 shardDir = shardRestCenter - center;
            float centerDist = length(shardDir);
            if (centerDist < 1.0) shardDir = vec2(0.0, -1.0);
            else shardDir = normalize(shardDir);

            vec2 rnd = hash2(cell * 17.39 + vec2(13.1, 7.7));
            vec2 randVel = (rnd - vec2(0.5)) * 2.0;

            vec2 vel = (shardDir * dispersion * 2.2 + randVel * dispersion * 1.2);
            vec2 grav = vec2(0.0, gravity * 0.7);
            vec2 shardDelta = vel * (t * 110.0) + 0.5 * grav * (t * t * 1600.0);

            vec2 shardCurrentCenter = shardRestCenter + shardDelta;

            // Bounding box early-rejection in screen space
            vec2 diff = pixelPos - shardCurrentCenter;
            if (abs(diff.x) > cellSize * 1.6 || abs(diff.y) > cellSize * 1.6) {
                continue;
            }

            // Invert shard spin
            float spin = (rnd.x - 0.5) * rotation * 0.08 * progress;
            float cosA = cos(spin);
            float sinA = sin(spin);
            vec2 localDiff = mat2(cosA, sinA, -sinA, cosA) * diff;

            vec2 restP = shardRestCenter + localDiff;

            // Check if restP belongs to this cell in rest-frame Voronoi tessellation
            float d0 = length(restP - shardRestCenter);
            bool inShard = true;
            float minNeighborDist = 10000.0;

            for (int ny = -1; ny <= 1; ny++) {
                for (int nx = -1; nx <= 1; nx++) {
                    if (nx == 0 && ny == 0) continue;
                    vec2 ncell = cell + vec2(float(nx), float(ny));
                    vec2 npt = hash2(ncell * 3.17);
                    vec2 nCenter = (ncell + 0.15 + 0.7 * npt) * cellSize;
                    float dn = length(restP - nCenter);
                    minNeighborDist = min(minNeighborDist, dn);
                    if (dn < d0) {
                        inShard = false;
                        break;
                    }
                }
                if (!inShard) break;
            }

            if (inShard) {
                // Depth layer sorting
                float z = rnd.y + rnd.x * 0.3;
                if (z > bestZ) {
                    vec2 sampleUv = restP / texSize;
                    if (sampleUv.x >= 0.0 && sampleUv.x <= 1.0 &&
                        sampleUv.y >= 0.0 && sampleUv.y <= 1.0) {
                        vec4 col = texture(tex, sampleUv);
                        if (col.a > 0.01) {
                            // Glass fracture bevel edge
                            float edgeDist = (minNeighborDist - d0);
                            float edge = smoothstep(0.5, 3.5, edgeDist);
                            float highlight = 1.0 - smoothstep(1.5, 4.5, edgeDist);

                            col.rgb = (col.rgb + vec3(highlight * 0.4)) * edge;
                            col.a *= edge;

                            // Shard air drag fade
                            float fade = clamp(1.0 - t * 0.35, 0.0, 1.0);
                            col *= fade;

                            bestColor = col;
                            bestZ = z;
                            found = true;
                        }
                    }
                }
            }
        }
    }

    if (found) {
        fragColor = bestColor;
    } else {
        fragColor = vec4(0.0);
    }
}
