#!/usr/bin/env node

import { green, reverse, red, grey } from "btss";
import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { homedir } from "os";
import { spawn } from "child_process";
import { resolve } from "path";
import { parse } from "dotenv";
import fetch from "node-fetch";
import explainStatusCode from "./errorType.js";
import watch from "recursive-watch";

globalThis.log = (str) => console.log(str);
globalThis.completions = "config quit clear log help".split(" ");
const config_path = homedir() + "/.config/.razite.json";

console.log("RAZITE")
console.log('type "help" to know more!')
init();
function init() {
  try {
    globalThis.config = loadJson(config_path, 1);
  } catch (e) {
    globalThis.config = resetConfig();
  }
  const rl = createRl();
  rl.on("line", async (line) => {
    try {
      await parseCommand(line, rl);
    } catch (e) {
      log(e.message);
    }
  });
}

async function parseCommand(line, rl) {
  line = line.split(" ").filter(Boolean);
  switch (line[0]) {
    case "config":
      rl.close();
      return openConfig();
    case "clear":
      return console.clear();
    case "watch":
      return watchPath(line[1], line[2]);
    case "help":
      return help();
    case "reset":
      return config = resetConfig();
    case "load":
      return loadEnv(line[1]);
    case "log":
      line.shift();
      let value = config;
      for (const key of line) value = value[key];
      return console.log(value);
    case "quit":
      process.exit();
    default:
      if (line[0]) await fetchLink(line[0]);
      break;
  }
}

function loadEnv(path) {
  const keys = parse(readFile(path, true), "utf-8");
  config = { ...keys, ...config };
  writeFileSync(config_path, JSON.stringify(config));
}

function watchPath(path, link = "def") {
  globalThis.watching = false;
  watch(path, function (filename) {
    if (watching) return;
    setTimeout(() => (watching = false), 100);
    watching = true;
    console.log(green("Change dectected."));
    fetchLink(link);
  });
}

function resetConfig() {
  const data = readFile("../config.swp");
  writeFileSync(config_path, data);
  log(green("changed .razite.json"));
  return JSON.parse(data);
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
    return console.log(red(`${command} not defined!`));
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
      log("method : " + options.method);
      log(options);
      log(explainStatusCode(response.status));
    }

  const end_time = new Date().getTime();
  log(grey(`fetch ended in ${(end_time - start_time) / 1000}s`));

  if (exitAfter) return process.exit();
}

function openConfig() {
  const editor = process.env.EDITOR || "vim";

  const child = spawn(editor, [config_path], {
    stdio: "inherit",
  });

  child.on("exit", (e, code) => {
    init();
  });
}

function handleFetchErrors(err) {
  log(red(err.name));
  err.type ? log(`type : ${err.type}`) : "";
  log(err.message);

  if (this.exitAfter) return;
  switch (err.name) {
    case "SyntaxError":
      log(grey(`fetching as text instead`));
      request(this.link, config.options, "text", this.exitAfter);
      break;
    case "system":
      break;
    default:
      log(err.name);
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
