# Bundled 3D models (CC0)

Shipped as `lib/assets/vendor/iui-models@1/<file>` (copied by `scripts/vendor-assets.mjs`) so the
host 3D stage (`data-iui-3d`) can show these refs with no network, behind the plugin's asset route.
The list and metadata live in `src/shared/model-catalog.ts` (`BUNDLED_MODELS`).

All files are CC0-1.0 (public domain dedication; no attribution required — credit kept anyway):

| ref | source | author |
| --- | --- | --- |
| `polyhaven:ArmChair_01` | https://polyhaven.com/a/ArmChair_01 | Kirill Sannikov |
| `polyhaven:Camera_01` | https://polyhaven.com/a/Camera_01 | Rajil Jose Macatangay |
| `polyhaven:Television_01` | https://polyhaven.com/a/Television_01 | Gabriel Radić |
| `polyhaven:antique_ceramic_vase_01` | https://polyhaven.com/a/antique_ceramic_vase_01 | James Ray Cock |
| `polyhaven:boombox` | https://polyhaven.com/a/boombox | Thomas Paul Mouilleron |
| `polyhaven:desk_lamp_arm_01` | https://polyhaven.com/a/desk_lamp_arm_01 | Yann Kervran, Kuutti Siitonen |
| `polyhaven:food_apple_01` | https://polyhaven.com/a/food_apple_01 | Oliver Harries |
| `polyhaven:potted_plant_04` | https://polyhaven.com/a/potted_plant_04 | James Ray Cock |
| `polyhaven:rubber_duck_toy` | https://polyhaven.com/a/rubber_duck_toy | Plat251 |
| `khronos:ToyCar` | KhronosGroup/glTF-Sample-Assets `Models/ToyCar` | Guido Odendahl, Eric Chadwick |
| `khronos:WaterBottle` | KhronosGroup/glTF-Sample-Assets `Models/WaterBottle` | Microsoft |

Khronos files are from commit `15cd02d304e54cb42a4db4eefe719f76190f4b68` (CC0-1.0 entries only).
Poly Haven files are the 1k glTF downloads.

## How they were made

```sh
npm i @gltf-transform/cli@4   # build-time tool only, not shipped
gltf-transform optimize <in> <id>.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify false
# Camera_01 and ToyCar use --texture-size 512
```

The stage registers three.js' MeshoptDecoder (`EXT_meshopt_compression`); WebP textures
(`EXT_texture_webp`) decode natively in every evergreen browser.
