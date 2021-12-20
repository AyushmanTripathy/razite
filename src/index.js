#!/usr/bin/env node

import { green, reverse, red, dim } from "btss";
import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { spawn } from "child_process";
import { resolve } from "path";
import { parse } from "dotenv";
import fetch from "node-fetch";
import explainStatusCode from "./errorType.js";
import watch from "recursive-watch";

globalThis.log = (str) => console.log(str);
globalThis.completions = "config quit clear log help".split(" ");

init();
function init() {
  globalThis.config = loadJson("../config.json");
  const rl = createRl();
  question(rl);
}

function question(rl) {
  rl.question("> ", async (line) => {
    try {
      await parseCommand(line, rl);
    } catch (e) {
      log(e);
    }
    question(rl);
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
      return resetConfig();
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
  log(keys)
  config = { ...keys, ...config };
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
  writeFileSync(
    new URL("../config.json", import.meta.url).pathname,
    readFile("../config.swp")
  );
  log(green("changed config.json"));
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
  log(dim(`fetching ${link}`));

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
      log(options);
      log(explainStatusCode(response.status));
    }

  const end_time = new Date().getTime();
  log(dim(`fetch ended in ${(end_time - start_time) / 1000}s`));

  if (exitAfter) return process.exit();
}

function openConfig() {
  const editor = process.env.EDITOR || "vim";

  const child = spawn(
    editor,
    [new URL("../config.json", import.meta.url).pathname],
    {
      stdio: "inherit",
    }
  );

  child.on("exit", (e, code) => {
    init();
  });
}

function handleFetchErrors(err) {
  log(red(err.name));
  log(`type : ${err.type}`);
  log(err.message);

  if (this.exitAfter) return;
  switch (err.type) {
    case "invalid-json":
      log(dim(`fetching as text instead`));
      request(this.link, options, "text", this.exitAfter);
      break;
    case "system":
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
  try {
    return JSON.parse(readFile(path));
  } catch (e) {
    if (e.name == "SyntaxError") log("Invalid syntax in config.json");
    else log(e.message);
    throw "couldn't load json";
  }
}

function createRl() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer,
    terminal: true,
  });
}
