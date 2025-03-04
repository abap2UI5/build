# abap2UI5-build

Namespace: `zabap2ui5`


| Branch    | Status                | 
|-----------| ---------------------------| 
| cloud  | ![Static Badge](https://img.shields.io/badge/build-passed-green) |
| cloud+addons | ![Static Badge](https://img.shields.io/badge/build-no-yellow) |
|    |  |
| 750   | ![Static Badge](https://img.shields.io/badge/build-no-yellow) |
| 750+frontend   | ![Static Badge](https://img.shields.io/badge/build-no-yellow) |
| 750+frontend+addons   | ![Static Badge](https://img.shields.io/badge/build-no-yellow) |
|    |  |
| 702   | ![Static Badge](https://img.shields.io/badge/build-no-yellow) |

### Process

1. Create a new build:
```sh
git clone https://github.com/abap2UI5/builder
cd builder
npm i

# choose the setup folder you need
rm -rf setup/*
cp -r ../setup/cloud/* setup
npm run build
```

2. Save it as a new branch:

```sh
# make sure you are in the root folder
cp -r builder/dist/* ../..
rm -rf builder
git checkout -b cloud
git add .
git commit -m "my new build"
git push origin cloud --force

```
