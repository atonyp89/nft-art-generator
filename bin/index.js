#!/usr/bin/env node

//TODO
//CHECK FOR TRAILING SLASHES ON ALL INPUTS

//IMPORTS
const chalk = require('chalk');
const boxen = require('boxen');
const ora = require('ora');
const inquirer = require('inquirer');
const fs = require('fs');
const { readFile, writeFile, readdir } = require("fs").promises;
const mergeImages = require('merge-images');
const { Image, Canvas } = require('canvas');
const ImageDataURI = require('image-data-uri');

/* Index
0 - Accesories
1 - Back Hand
2 - Background
3 - Body
4 - Carry On
5 - Chair
6 - Eyes
7 - Front Hand
8 - Hair
9 - Head Type
10 - Headgear
11 - Headphone
12 - Headphone Sticker
13 - Mouth
14 - Special
15 - Watch
*/

let HEADGEAR_ORDER = 13;
let HAIR_ORDER = 10;
let ACCESORIES_ORDER = 9;
let EYES_ORDER = 8;

//SETTINGS
let basePath;
let outputPath;
let traits;
let traitsToSort = [];
let order = [
  2,  // Background
  14, // Special
  1,  // Back Hand
  15, // Watch
  4,  // Carry On
  3,  // Body
  5,  // Chair
  9,  // Head Type
  6,  // Eyes
  0,  // Accesories
  8,  // Hair
  7,  // Front Hand
  13, // Mouth
  10, // Headgear
  11, // Headphone
  12  // Headphone sticker
];
let weights = {};
let names = {};
let weightedTraits = [];
let seen = [];
let metaData = {};
let config = {
  metaData: {},
  useCustomNames: null,
  deleteDuplicates: null,
  generateMetadata: null,
};
let argv = require('minimist')(process.argv.slice(2));

//DEFINITIONS
const getDirectories = source =>
  fs
    .readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

const sleep = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000))

//OPENING
console.log(
  boxen(
    chalk.blue(
      ' /$$   /$$ /$$$$$$$$ /$$$$$$$$        /$$$$$$  /$$$$$$$  /$$$$$$$$        /$$$$$$  /$$$$$$$$ /$$   /$$ /$$$$$$$$ /$$$$$$$   /$$$$$$  /$$$$$$$$ /$$$$$$  /$$$$$$$ \n' +
        '| $$$ | $$| $$_____/|__  $$__/       /$$__  $$| $$__  $$|__  $$__/       /$$__  $$| $$_____/| $$$ | $$| $$_____/| $$__  $$ /$$__  $$|__  $$__//$$__  $$| $$__  $$\n' +
        '| $$$$| $$| $$         | $$         | $$  \\ $$| $$  \\ $$   | $$         | $$  \\__/| $$      | $$$$| $$| $$      | $$  \\ $$| $$  \\ $$   | $$  | $$  \\ $$| $$  \\ $$\n' +
        '| $$ $$ $$| $$$$$      | $$         | $$$$$$$$| $$$$$$$/   | $$         | $$ /$$$$| $$$$$   | $$ $$ $$| $$$$$   | $$$$$$$/| $$$$$$$$   | $$  | $$  | $$| $$$$$$$/\n' +
        '| $$  $$$$| $$__/      | $$         | $$__  $$| $$__  $$   | $$         | $$|_  $$| $$__/   | $$  $$$$| $$__/   | $$__  $$| $$__  $$   | $$  | $$  | $$| $$__  $$\n' +
        '| $$\\  $$$| $$         | $$         | $$  | $$| $$  \\ $$   | $$         | $$  \\ $$| $$      | $$\\  $$$| $$      | $$  \\ $$| $$  | $$   | $$  | $$  | $$| $$  \\ $$\n' +
        '| $$ \\  $$| $$         | $$         | $$  | $$| $$  | $$   | $$         |  $$$$$$/| $$$$$$$$| $$ \\  $$| $$$$$$$$| $$  | $$| $$  | $$   | $$  |  $$$$$$/| $$  | $$\n' +
        '|__/  \\__/|__/         |__/         |__/  |__/|__/  |__/   |__/          \\______/ |________/|__/  \\__/|________/|__/  |__/|__/  |__/   |__/   \\______/ |__/  |__/\n \n' +
        'Made with '
    ) +
      chalk.red('❤') +
      chalk.blue(' by NotLuksus'),
    { borderColor: 'red', padding: 3 }
  )
);
main();

async function main() {
  await loadConfig();
  await getBasePath();
  await getOutputPath();
  await checkForDuplicates();
  await generateMetadataPrompt();
  if (config.generateMetadata) {
    await metadataSettings();
  }
  const loadingDirectories = ora('Loading traits');
  loadingDirectories.color = 'yellow';
  loadingDirectories.start();
  traits = getDirectories(basePath);
  traitsToSort = [...traits];
  await sleep(2);
  loadingDirectories.succeed();
  loadingDirectories.clear();
  // await traitsOrder(true);
  await customNamesPrompt();
  await asyncForEach(traits, async trait => {
    await setNames(trait);
  });
  await asyncForEach(traits, async trait => {
    await setWeights(trait);
  });
  const generatingImages = ora('Generating images');
  generatingImages.color = 'yellow';
  generatingImages.start();
  await generateImages();
  await sleep(2);
  generatingImages.succeed('All images generated!');
  generatingImages.clear();
  if (config.generateMetadata) {
    const writingMetadata = ora('Exporting metadata');
    writingMetadata.color = 'yellow';
    writingMetadata.start();
    await writeMetadata();
    await sleep(0.5);
    writingMetadata.succeed('Exported metadata successfully');
    writingMetadata.clear();
  }
  if (argv['save-config']) {
    const writingConfig = ora('Saving configuration');
    writingConfig.color = 'yellow';
    writingConfig.start();
    await writeConfig();
    await sleep(0.5);
    writingConfig.succeed('Saved configuration successfully');
    writingConfig.clear();
  }
}

//GET THE BASEPATH FOR THE IMAGES
async function getBasePath() {
  if (config.basePath !== undefined) { 
    basePath = config.basePath;
    return;
  }
  const { base_path } = await inquirer.prompt([
    {
      type: 'list',
      name: 'base_path',
      message: 'Where are your images located?',
      choices: [
        { name: 'In the current directory', value: 0 },
        { name: 'Somewhere else on my computer', value: 1 },
      ],
    },
  ]);
  if (base_path === 0) {
    basePath = process.cwd() + '/images/';
  } else {
    const { file_location } = await inquirer.prompt([
      {
        type: 'input',
        name: 'file_location',
        message: 'Enter the path to your image files (Absolute filepath)',
      },
    ]);
    let lastChar = file_location.slice(-1);
    if (lastChar === '/') basePath = file_location;
    else basePath = file_location + '/';
  }
  config.basePath = basePath;
}

//GET THE OUTPUTPATH FOR THE IMAGES
async function getOutputPath() {
  if (config.outputPath !== undefined) {
    outputPath = config.outputPath
    return;
  }
  const { output_path } = await inquirer.prompt([
    {
      type: 'list',
      name: 'output_path',
      message: 'Where should the generated images be exported?',
      choices: [
        { name: 'In the current directory', value: 0 },
        { name: 'Somewhere else on my computer', value: 1 },
      ],
    },
  ]);
  if (output_path === 0) {
    outputPath = process.cwd() + '/output/';
  } else {
    const { file_location } = await inquirer.prompt([
      {
        type: 'input',
        name: 'file_location',
        message:
          'Enter the path to your output_old directory (Absolute filepath)',
      },
    ]);
    let lastChar = file_location.slice(-1);
    if (lastChar === '/') outputPath = file_location;
    else outputPath = file_location + '/';
  }
  config.outputPath = outputPath;
}

async function checkForDuplicates() {
  if (config.deleteDuplicates !== null) return;
  let { checkDuplicates } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'checkDuplicates',
      message:
        'Should duplicated images be deleted? (Might result in less images then expected)',
    },
  ]);
  config.deleteDuplicates = checkDuplicates;
}

async function generateMetadataPrompt() {
  if (config.generateMetadata !== null) return;
  let { createMetadata } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'createMetadata',
      message: 'Should metadata be generated?',
    },
  ]);
  config.generateMetadata = createMetadata;
}

async function metadataSettings() {
  if (Object.keys(config.metaData).length !== 0) return;
  let responses = await inquirer.prompt([
    {
      type: 'input',
      name: 'metadataName',
      message: 'What should be the name? (Generated format is NAME#ID)',
    },
    {
      type: 'input',
      name: 'metadataDescription',
      message: 'What should be the description?',
    },
    {
      type: 'input',
      name: 'metadataImageUrl',
      message: 'What should be the image url? (Generated format is URL/ID)',
    },
    {
      type: 'confirm',
      name: 'splitFiles',
      message: 'Should JSON metadata be split in multiple files?',
    },
  ]);
  config.metaData.name = responses.metadataName;
  config.metaData.description = responses.metadataDescription;
  config.metaData.splitFiles = responses.splitFiles;
  let lastChar = responses.metadataImageUrl.slice(-1);
  if (lastChar === '/') config.imageUrl = responses.metadataImageUrl;
  else config.imageUrl = responses.metadataImageUrl + '/';
}

//SELECT THE ORDER IN WHICH THE TRAITS SHOULD BE COMPOSITED
async function traitsOrder(isFirst) {
  if (config.order && config.order.length === traits.length) {
    order = config.order;
    return;
  }
  const traitsPrompt = {
    type: 'list',
    name: 'selected',
    choices: [],
  };
  traitsPrompt.message = 'Which trait should be on top of that?';
  if (isFirst === true) traitsPrompt.message = 'Which trait is the background?';
  traitsToSort.forEach(trait => {
    const globalIndex = traits.indexOf(trait);
    traitsPrompt.choices.push({
      name: trait.toUpperCase(),
      value: globalIndex,
    });
  });
  const { selected } = await inquirer.prompt(traitsPrompt);
  order.push(selected);
  config.order = order;
  let localIndex = traitsToSort.indexOf(traits[selected]);
  traitsToSort.splice(localIndex, 1);
  if (order.length === traits.length) return;
  await traitsOrder(false);
}

//SELECT IF WE WANT TO SET CUSTOM NAMES FOR EVERY TRAITS OR USE FILENAMES
async function customNamesPrompt() {
    if (config.useCustomNames !== null) return;
    let { useCustomNames } = await inquirer.prompt([
      {
        type: 'list',
        name: 'useCustomNames',
        message: 'How should be constructed the names of the traits?',
        choices: [
          { name: 'Use filenames as traits names', value: 0 },
          { name: 'Choose custom names for each trait', value: 1 },
        ],
      },
    ]);
    config.useCustomNames = useCustomNames;
}

//SET NAMES FOR EVERY TRAIT
async function setNames(trait) {
  if (config.useCustomNames) {
    names = config.names || names;
    const files = await getFilesForTrait(trait);
    const namePrompt = [];
    files.forEach((file, i) => {
      if (config.names && config.names[file] !== undefined) return;
      namePrompt.push({
        type: 'input',
        name: trait + '_name_' + i,
        message: 'What should be the name of the trait shown in ' + file + '?',
      });
    });
    const selectedNames = await inquirer.prompt(namePrompt);
    files.forEach((file, i) => {
      if (config.names && config.names[file] !== undefined) return;
      names[file] = selectedNames[trait + '_name_' + i];
    });
    config.names = {...config.names, ...names};
  } else {
    const files = fs.readdirSync(basePath + '/' + trait);
    files.forEach((file, i) => {
      names[file] = file.split('.')[0];
    });
  }
}

//SET WEIGHTS FOR EVERY TRAIT
async function setWeights(trait) {
  if (config.weights && Object.keys(config.weights).length === Object.keys(names).length ) {
    weights = config.weights;
    return;
  }
  const files = await getFilesForTrait(trait);
  const weightPrompt = [];
  files.forEach((file, i) => {
    weightPrompt.push({
      type: 'input',
      name: names[file] + '_weight',
      message: 'How many ' + names[file] + ' ' + trait + ' should there be?',
      default: parseInt(Math.round(1000 / files.length)),
    });
  });
  const selectedWeights = await inquirer.prompt(weightPrompt);
  console.log(selectedWeights)

  // const data = await readFile('weight_config.json')
  // weigthConfig = JSON.parse(data.toString());
  // const selectedWeights = weigthConfig[trait];
  // console.log(trait)
  // console.log(selectedWeights)

  files.forEach((file, i) => {
    weights[file] = selectedWeights[names[file] + '_weight'];
  });
  config.weights = weights;
}

//ASYNC FOREACH
async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

//GENERATE WEIGHTED TRAITS
async function generateWeightedTraits() {
  for (const trait of traits) {
    const traitWeights = [];
    const files = await getFilesForTrait(trait);
    files.forEach(file => {
      for (let i = 0; i < weights[file]; i++) {
        traitWeights.push(file);
      }
    });
    weightedTraits.push(traitWeights);
  }
}

//GENARATE IMAGES
async function generateImages() {
  let noMoreMatches = 0;
  let images = [];
  let id = 10000;
  await generateWeightedTraits();
  if (config.deleteDuplicates) {
    while (!Object.values(weightedTraits).filter(arr => arr.length == 0).length && noMoreMatches < 20000) {
      let picked = [];
      var pickedImgs = []
      // Modify order for certain trait variant

      var skippedHat = false
      var reOrderHeadphone = false
      var reOrderBaldHair = false
      var moveScarDown = false
      var moveLightningEyeTop = false

      order.forEach(id => {
        var trait = traits[id];

        if (trait == "Headgear" && skippedHat) {
          // console.log("Skipping Hat")
          return
        }

        let pickedImgId = pickRandom(weightedTraits[id]);
        picked.push(pickedImgId);
        let pickedImg = weightedTraits[id][pickedImgId];
        pickedImgs.push(pickedImg)

        // check if hair is possible to put hat in
        if (trait == "Hair") {
          if (pickedImg.includes("Hat") == false) {
            skippedHat = true
          }

          if (pickedImg.includes("Bald") == true ||
          pickedImg.includes("Dreads") == true) {
            reOrderBaldHair = true
          }
        }

        // swap order between Headgear and Headphone
        if (trait == "Headgear") {
          if (pickedImg.includes("BELOW") == false) {
            reOrderHeadphone = true
          }
        }

        if (trait == "Accesories") {
          if (pickedImg.includes("Scar") == true) {
            moveScarDown = true
          }
        }

        if (trait == "Eyes") {
          if (
            pickedImg.includes("Lightning") == true ||
            pickedImg.includes("Fire") == true
          ) {
            moveLightningEyeTop = true
          }
        }

        images.push(basePath + trait + '/' + pickedImg);
      });

      // move headphone & sticker to below headgear
      if (reOrderHeadphone == true) {
        var traitOrder = HEADGEAR_ORDER
        var headgearTrait = images[traitOrder]
        var headphoneTrait = images[traitOrder+1]
        var headphoneStickerTrait = images[traitOrder+2]

        images[traitOrder] = headphoneTrait
        images[traitOrder+1] = headphoneStickerTrait
        images[traitOrder+2] = headgearTrait
      }

      var accessoryOrder = ACCESORIES_ORDER;
      var eyesOrder = EYES_ORDER;

      // TODO: problem with Bald hair & Scar
      if (moveScarDown == true) {
        var accessoryTrait = images[accessoryOrder]

        var eyeTrait = images[eyesOrder]

        images[accessoryOrder] = eyeTrait
        images[eyesOrder] = accessoryTrait

        var tmp = accessoryOrder
        accessoryOrder = eyesOrder
        eyesOrder = tmp
      }

      // move accessories above hair
      if (reOrderBaldHair == true) {
        var traitOrder = HAIR_ORDER
        var hairTrait = images[traitOrder]
        var accessoryTrait = images[accessoryOrder]

        images[traitOrder] = accessoryTrait
        images[accessoryOrder] = hairTrait

        // update new order
        accessoryOrder = traitOrder
      }

      if (moveLightningEyeTop == true) {
        var traitOrder = eyesOrder
        var eyeTrait = images[traitOrder]
        
        images.splice(traitOrder, 1);
        images.push(eyeTrait)
      }

      // filter conflicting images here
      // Mask <> *Blindfold Accessory
      if (pickedImgs.includes("Masked Mouth.png") &&
        (
          pickedImgs.includes("Brown Camo Blindfold.png") || 
          pickedImgs.includes("Green Camo Blindfold.png") ||
          pickedImgs.includes("Bleedinig Eye Patch.png")
          )
      ) {
        // console.log("Conflicting ", pickedImgs)
        // ignore
        noMoreMatches++;
        images = [];
        continue;
      }

      // Lightning Eye <> *Blindfold Accessory
      if (
        (
          pickedImgs.includes("Front Eyes Lightning.png") ||
          pickedImgs.includes("Fire Eyes.png")
        ) &&
        (
          pickedImgs.includes("Bleedinig Eye Patch.png") || 
          pickedImgs.includes("Brown Camo Blindfold.png") ||
          pickedImgs.includes("Cyclops Eye Band.png") ||
          pickedImgs.includes("Green Camo Blindfold.png") ||
          pickedImgs.includes("Japan Eyeband.png") ||
          pickedImgs.includes("Japan Eyepatch.png") ||
          pickedImgs.includes("Peace Sign Eyepatch.png") ||
          pickedImgs.includes("Pirate Eyepatch.png")
        )
      ) {
        // console.log("Conflicting ", pickedImgs)

         // ignore
         noMoreMatches++;
         images = [];
         continue;
      }

      // Reorder layer if having special traits
      // Add front image special
      // Autumn
      // Greenleaves
      // Sakura
      // Smoke
      if (pickedImgs.includes("Autumn.png")) {
        images.push(`./special_front/Autumn_front.png`);
      }

      if (pickedImgs.includes("Greenleaves.png")) {
        images.push(`./special_front/Greenleaves_front.png`);
      }

      if (pickedImgs.includes("Sakura.png")) {
        images.push(`./special_front/Sakura_front.png`);
      }

      if (pickedImgs.includes("Smoke.png")) {
        images.push(`./special_front/Smoke_front.png`);
      }

      if (existCombination(images)) {
        noMoreMatches++;
        images = [];
      } else {
        generateMetadataObject(id, images);
        noMoreMatches = 0;
        order.forEach((id, i) => {
          remove(weightedTraits[id], picked[i]);
        });
        seen.push(images);
        // console.log(images)
        const b64 = await mergeImages(images, { Canvas: Canvas, Image: Image });
        await ImageDataURI.outputFile(b64, outputPath + `${id}.png`);
        images = [];
        id++;
      }
    }
  } else {
    while (!Object.values(weightedTraits).filter(arr => arr.length == 0).length) {
      order.forEach(id => {
        images.push(
          basePath + traits[id] + '/' + pickRandomAndRemove(weightedTraits[id])
        );
      });
      generateMetadataObject(id, images);
      const b64 = await mergeImages(images, { Canvas: Canvas, Image: Image });
      await ImageDataURI.outputFile(b64, outputPath + `${id}.png`);
      images = [];
      id++;
    }
  }
}

//GENERATES RANDOM NUMBER BETWEEN A MAX AND A MIN VALUE
function randomNumber(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

//PICKS A RANDOM INDEX INSIDE AN ARRAY RETURNS IT AND THEN REMOVES IT
function pickRandomAndRemove(array) {
  const toPick = randomNumber(0, array.length - 1);
  const pick = array[toPick];
  array.splice(toPick, 1);
  return pick;
}

//PICKS A RANDOM INDEX INSIDE AND ARRAY RETURNS IT
function pickRandom(array) {
  return randomNumber(0, array.length - 1);
}

function remove(array, toPick) {
  array.splice(toPick, 1);
}

function existCombination(contains) {
  let exists = false;
  seen.forEach(array => {
    let isEqual =
      array.length === contains.length &&
      array.every((value, index) => value === contains[index]);
    if (isEqual) exists = true;
  });
  return exists;
}

function generateMetadataObject(id, images) {
  metaData[id] = {
    name: config.metaData.name + '#' + id,
    description: config.metaData.description,
    image: config.imageUrl + id,
    attributes: [],
  };
  images.forEach((image, i) => {
    let pathArray = image.split('/');
    let fileToMap = pathArray[pathArray.length - 1];
    metaData[id].attributes.push({
      trait_type: traits[order[i]],
      value: names[fileToMap],
    });
  });
}

async function writeMetadata() {
  if(config.metaData.splitFiles)
  {
    let metadata_output_dir = outputPath + "metadata/"
    if (!fs.existsSync(metadata_output_dir)) {
      fs.mkdirSync(metadata_output_dir, { recursive: true });
    }
    for (var key in metaData){
      await writeFile(metadata_output_dir + key, JSON.stringify(metaData[key]));
    }
  }else
  {
    await writeFile(outputPath + 'metadata.json', JSON.stringify(metaData));
  }
}

async function loadConfig() {
  try {
    const data = await readFile('config.json')
    config = JSON.parse(data.toString());
  } catch (error) {}
}

async function writeConfig() {
  await writeFile('config.json', JSON.stringify(config, null, 2));
}

async function getFilesForTrait(trait) {
  return (await readdir(basePath + '/' + trait)).filter(file => file !== '.DS_Store');
}
