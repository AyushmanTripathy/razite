#!/usr/bin/env node

import { green, reverse, red, grey, bold } from "btss";
import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { homedir } from "os";
import { spawn } from "child_process";
import { resolve } from "path";
import { parse } from "dotenv";
import fetch from "node-fetch";
import explainStatusCode from "./errorType.js";
import { watch } from "chokidar";

const log = (str) => console.log(str);
const saveConfig = () => writeFileSync(config_path, JSON.stringify(config));
const completions = "edit exit quit clear log help watch load reset".split(
  " "
);
const write = (x) => process.stdin.write(x);
let rl = createRl();
let watching = false;

const config_path = homedir() + "/.config/.razite.json";
const promptString = green(">>> ");
rl.setPrompt(promptString);

init();
function init() {
  try {
    globalThis.config = loadJson(config_path, 1);
  } catch (e) {
    resetConfig();
  }
  printFrame();
  ask();
}

function ask() {
  rl.question(promptString, async (input) => {
    try {
      await parseCommand(input);
    } catch (e) {
      console.error(e);
    }
  });
}

function printFrame() {
  console.clear();
  log(bold("RAZITE"));
  log(`\nDEF: ${config[config.def]}`);
  log(`WATCHING: ${watching ? watching : "NO"}\n`);
  log(`METHOD: ${config.options.method}`);
  console.log(`HEADERS:`, config.options.headers);
  console.log(`BODY:`, config.options.body);
  log("");
}

async function parseCommand(line, rl) {
  line = line.split(" ").filter(Boolean);
  switch (line[0]) {
    case "set":
      set(line[1],line[2]);
      return ask();
    case "edit":
      return openConfig();
    case "clear":
      break;
    case "watch":
      watchPath(line[1], line[2]);
      break;
    case "help":
      help();
      break;
    case "reset":
      resetConfig();
      break;
    case "load":
      loadEnv(line[1]);
      break;
    case "log":
      line.shift();
      let value = config;
      for (const key of line) value = value[key];
      console.log(value);
      return ask();
    case "quit":
      process.exit();
    case "exit":
      process.exit();
    default:
      if (line[0]) await fetchLink(line[0]);
      return ask();
  }
  printFrame();
  ask();
}

function set(key, value) {
  let p = config;
  const keys = key.split(".");
  const lastKey = keys.pop();
  for (const i of keys) p = p[i];
  p[lastKey] = value;

  printFrame();
  log(`setted ${key} : ${value}`);
  saveConfig();
}

function loadEnv(path) {
  const keys = parse(readFile(path, true), "utf-8");
  config = { ...keys, ...config };
  saveConfig();
}

function watchPath(path, link = "def") {
  watching = path;
  let wait = true;
  setTimeout(() => (wait = false), 1000);
  watch(path).on("all", async (event, file) => {
    if (wait) return;
    printFrame();
    console.log(green("Change dectected."));
    await fetchLink(link);
    ask();
  });
}

function resetConfig() {
  const data = readFile("../config.swp");
  writeFileSync(config_path, data);
  globalThis.config = JSON.parse(data);
  printFrame();
  log(green("changed .razite.json"));
}

async function fetchLink(command) {
  // fetch if it is a link
  if (command.startsWith("http"))
    return await request(command, config.options, config.type);

  //special case for def
  if (command == "def") {
    if (config.def.startsWith("http"))
      return await request(config.def, config.options, config.type);
    else if (!config[config.def])
      return console.log(red(`def ${config.def} is not defined!`));
    else command = config.def;
  }

  //check if var exits
  if (!config[command] && command)
    return console.log(red(`${command} not valid!`));
  if (command != undefined)
    await request(config[command], config.options, config.type);
}

async function request(link, options, type, exitAfter) {
  log(grey(`fetching ${link}`));

  const start_time = new Date().getTime();

  let optionsClone = { ...options };
  delete optionsClone.body;

  if (["PUT", "POST", "PATCH"].includes(options.method))
    optionsClone.body = JSON.stringify(options.body);

  const response = await fetch(link, optionsClone).catch(
    handleFetchErrors.bind({ link, exitAfter })
  );

  if (response)
    if (response.ok) {
      log(green(`server responded with status ${reverse(response.status)}`));
      const body = await response[type]().catch(
        handleFetchErrors.bind({ link })
      );
      if (body) log(body);
    } else {
      log(red(`server responded with status ${reverse(response.status)}`));
      log(explainStatusCode(response.status));
    }

  const end_time = new Date().getTime();
  log(grey(`fetch ended in ${(end_time - start_time) / 1000}s`));

  if (exitAfter) return process.exit();
}

function openConfig() {
  rl.close();
  const editor = process.env.EDITOR || "vim";
  const child = spawn(editor, [config_path], {
    stdio: "inherit",
  });

  child.on("exit", (e, code) => {
    rl = createRl();
    rl.setPrompt(promptString);
    init();
  });
  return true;
}

function handleFetchErrors(err) {
  write(red(err.name));
  err.type ? write(` | type : ${err.type}`) : "";
  write(`\n${err.message}\n`);

  if (this.exitAfter) return;
  switch (err.name) {
    case "SyntaxError":
      log(grey(`try fetching as text instead`));
      break;
    case "system":
      break;
    default:
      break;
  }
}

function readFile(path, cwd) {
  return readFileSync(
    cwd
      ? resolve(process.cwd(), path)
      : new URL(path, import.meta.url).pathname,
    "utf-8"
  );
}

function completer(line) {
  const word = line.split(" ").pop();
  const hits = completions.filter((tag) => tag.startsWith(word));

  return [hits.length ? hits : completions, word];
}

function help() {
  console.log(readFile("../help.txt"));
}

function loadJson(path) {
  return JSON.parse(readFile(path));
}

function createRl() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer,
    terminal: true,
  });
}
