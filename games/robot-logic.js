// Level data and the program interpreter for Robot Commander (no DOM, so it can be tested in Node).
(function (root) {
  const DIRS = { "^": [0, -1], ">": [1, 0], v: [0, 1], "<": [-1, 0] };
  const ORDER = ["^", ">", "v", "<"];
  const MAX_STEPS = 150;

  const LEVELS = [
    { title: "First steps", main: 4, fn: 0, grid: [">..*"], tip: "Add Move blocks, then press Run." },
    { title: "Turn the corner", main: 6, fn: 0, grid: [">..#", "##.#", "##*#"], tip: "Turns change direction without moving." },
    { title: "Staircase", main: 10, fn: 0, grid: [">.##", "#..#", "##.*"], tip: "Move, turn, move, turn..." },
    { title: "Big staircase", main: 5, fn: 4, grid: [">.####", "#..###", "##..##", "###..#", "####.*"],
      tip: "New! Put a repeated pattern in F, then call F from Main. That's a function." },
    { title: "Around the block", main: 4, fn: 4, grid: [">..*", ".##.", ".##.", "*..*"], tip: "Each side of the square is the same." },
    { title: "Double back", main: 5, fn: 3, grid: ["*..>..*"], tip: "Two turns make a U-turn." },
    { title: "The long road", main: 1, fn: 2, grid: [">.......*"], tip: "Can F call itself? That's recursion!" },
    { title: "Serpentine", main: 11, fn: 4, grid: [">...*", "####.", "*....", ".####", "....*"], tip: "Use F for the long straight parts." },
  ];

  function parse(level) {
    const chips = new Set();
    let robot = null;
    level.grid.forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (c === "*") chips.add(x + "," + y);
        if (DIRS[c]) robot = { x, y, dir: c };
      });
    });
    return { robot, chips };
  }

  // Runs a program and returns every frame for the UI, plus how it ended:
  // "win", "crash", "incomplete", or "overflow" (too many steps, usually endless recursion).
  function simulate(level, main, fn) {
    const { robot, chips } = parse(level);
    const programs = { main, fn };
    const stack = [{ name: "main", i: 0 }];
    const frames = [];
    let steps = 0;

    const snapshot = (name, i) => {
      frames.push({ x: robot.x, y: robot.y, dir: robot.dir, chips: [...chips], name, i });
    };

    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i >= programs[top.name].length) {
        stack.pop();
        continue;
      }
      if (++steps > MAX_STEPS) return { frames, result: "overflow" };

      const index = top.i++;
      const op = programs[top.name][index];
      if (op === "F") {
        stack.push({ name: "fn", i: 0 });
        continue;
      }
      if (op === "L" || op === "R") {
        const turn = op === "R" ? 1 : 3;
        robot.dir = ORDER[(ORDER.indexOf(robot.dir) + turn) % 4];
      } else {
        const [dx, dy] = DIRS[robot.dir];
        const nx = robot.x + dx, ny = robot.y + dy;
        const row = level.grid[ny];
        if (!row || row[nx] === undefined || row[nx] === "#") {
          snapshot(top.name, index);
          return { frames, result: "crash" };
        }
        robot.x = nx;
        robot.y = ny;
        chips.delete(nx + "," + ny);
      }
      snapshot(top.name, index);
      if (chips.size === 0) return { frames, result: "win" };
    }
    return { frames, result: "incomplete" };
  }

  const api = { LEVELS, parse, simulate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RobotLogic = api;
})(this);
