(() => {
  // parser.ts
  var Parser = class {
    inputString;
    tokens = null;
    peek() {
      return this.tokens[this.tokens.length - 1];
    }
    pop() {
      return this.tokens.pop();
    }
    expect(type) {
      const token = this.pop();
      if (token.type !== type)
        throw new CalculatorError(
          `Expected type ${type} but got ${token.type}!`
        );
      return token;
    }
    astTree = 0;
    constructor(inputString) {
      this.inputString = inputString;
    }
    evaluate(requestingExpression, context) {
      this.tokenize();
      this.buildTree();
      return this.evaluateTree(requestingExpression, context, this.astTree);
    }
    /**
     * Tokenize this parser's expression.
     */
    tokenize() {
      const matchedTokens = this.inputString.matchAll(tokenizer);
      const tokens = [];
      for (const match of matchedTokens) {
        const { groups } = match;
        if (!groups) continue;
        const type = tokenPatterns.find(
          ({ type: type2 }) => groups[type2] !== void 0
        )?.type;
        if (!type) continue;
        switch (type) {
          case "FUN":
            tokens.unshift({
              type,
              functionName: groups.FNNAME,
              functionArguments: groups.FNARGS.split(",").map(
                (e) => e.trim()
              )
            });
            break;
          case "VAR":
            tokens.unshift({ type, variableName: groups[type] });
            break;
          case "NUM":
            tokens.unshift({ type, value: Number(groups[type]) });
            break;
          case "INVALID":
            throw new CalculatorError(
              `Invalid token '${groups[type]}'!`
            );
          default:
            tokens.unshift({ type });
        }
      }
      tokens.unshift({ type: "END" });
      this.tokens = tokens;
    }
    // Convert to AST tree
    buildTree() {
      if (!this.tokens)
        throw new CalculatorError(
          "Expression tried to parse before being tokenized!"
        );
      if (this.peek().type === "END") {
        this.astTree = 0;
      } else {
        this.astTree = this.getExpression();
      }
    }
    getExpression() {
      let value1 = this.getTerm();
      const tokenChecks = ["ADD", "SUB"];
      while (tokenChecks.includes(this.peek().type)) {
        const operator = this.pop().type;
        const value2 = this.getTerm();
        value1 = {
          operator,
          value1,
          value2
        };
      }
      const t = this.peek().type;
      if (t !== "END" && t !== "RPAREN") {
        throw new CalculatorError("Expected RPAREN or END but got " + t);
      }
      return value1;
    }
    getTerm() {
      let value1 = this.getFactor();
      const tokenChecks = ["MUL", "DIV"];
      while (tokenChecks.includes(this.peek().type)) {
        const operator = this.pop().type;
        const value2 = this.getTerm();
        value1 = {
          operator,
          value1,
          value2
        };
      }
      return value1;
    }
    // Exponentiation (right-associative)
    getFactor() {
      let value1 = this.getUnary();
      const tokenChecks = ["EXP"];
      if (tokenChecks.includes(this.peek().type)) {
        const operator = this.pop().type;
        const value2 = this.getFactor();
        value1 = {
          operator,
          value1,
          value2
        };
      }
      return value1;
    }
    // Unary minus
    getUnary() {
      if (this.peek().type === "SUB") {
        this.pop();
        return { operator: "SUB", value1: 0, value2: this.getPrimary() };
      } else return this.getPrimary();
    }
    getPrimary() {
      const t = this.pop();
      if (t.type === "NUM") {
        return t.value;
      }
      if (t.type === "VAR") {
        return t.variableName;
      }
      if (t.type === "FUN") {
        const token = t;
        return token;
      }
      if (t.type === "LPAREN") {
        const expr = this.getExpression();
        this.expect("RPAREN");
        return expr;
      }
      throw new CalculatorError(`Unexpected token ${t.type}`);
    }
    evaluateTree(requestingExpression, context, node) {
      if (node === void 0) return 0;
      if (typeof node === "string") {
        const dependency = context.getVariable(node);
        if (!dependency)
          throw new CalculatorError(`Variable "${node}" not found!`);
        dependency.addDependency(requestingExpression);
        return dependency.getValue(requestingExpression, context);
      }
      if (typeof node === "number") {
        return Number(node);
      }
      if ("functionName" in node) {
        node = node;
        const e = context.getFunction(node.functionName);
        if (!e)
          throw new CalculatorError(
            `Function "${node.functionName}" not found!`
          );
        const args = e.getArgumentNames();
        if (node.functionArguments.length !== args.length)
          throw new CalculatorError(
            `Argument count of ${node.functionName} is ${node.functionArguments.length}; expected ${args.length}`
          );
        e.addDependency(requestingExpression);
        const functionLayer = {
          variables: {},
          functions: {}
        };
        for (const i in args) {
          functionLayer.variables[args[i]] = new Expression(
            requestingExpression.getCalculator(),
            node.functionArguments[i],
            false,
            false,
            requestingExpression
          );
        }
        const functionContext = context.copy();
        functionContext.addLayer(functionLayer);
        return e.getValue(requestingExpression, functionContext);
      }
      node = node;
      const v1 = this.evaluateTree(
        requestingExpression,
        context,
        node.value1
      );
      const v2 = this.evaluateTree(
        requestingExpression,
        context,
        node.value2
      );
      const v1Len = String(v1).length;
      const v2Len = String(v2).length;
      switch (node.operator) {
        case "ADD":
          this.checkGiveUp(
            requestingExpression,
            0.2 * Math.min(v1Len + 0.1 * v2Len, v2Len + 0.1 * v1Len) - 2,
            [
              "Adding big numbers is boring",
              "Couldn't you add those things instead?",
              "Forgot how addition works",
              "Calculator dilikes menial tasks",
              "Calculator can't do longhand addition"
            ]
          );
          return v1 + v2;
        case "SUB":
          this.checkGiveUp(
            requestingExpression,
            0.4 * Math.min(v1Len, v2Len) - 1,
            [
              "Calculator doesn't like subtraction",
              "Too tired to figure out the carry rules",
              "Scared of negative numbers",
              "Calculator dilikes menial tasks",
              "Calculator can't do longhand subtraction"
            ]
          );
          return v1 - v2;
        case "DIV":
          this.checkGiveUp(requestingExpression, 0.5 * v2Len, [
            "Division is difficult",
            "Forgot which one was the numerator",
            `Dividing by ${getRoundedString(v2)} takes time`,
            "Too tired to try long division",
            "Calculator finds fractions cofusing"
          ]);
          return v1 / v2;
        case "MUL":
          this.checkGiveUp(
            requestingExpression,
            0.5 * Math.max(v1Len, v2Len),
            [
              "Multiplication too difficult to do without pen and paper",
              "That's a lot of numbers to multiply",
              "Calculator forgot the times table",
              "Calculator isn't sure how lattice multiplication works; scared of doing it wrong",
              `Calculator never multiplied by ${getRoundedString(v2)} before`
            ]
          );
          return v1 * v2;
        case "EXP":
          this.checkGiveUp(
            requestingExpression,
            0.8 * Math.max(0.75 * v1Len, (v2Len - 1) * v2Len),
            [
              "Exponents are too difficult",
              "Could you try to simplify the exponent a bit?",
              "Calculator last did powers in high school; never practiced since",
              "Calculator forgot the power rules"
            ]
          );
          return Math.pow(v1, v2);
      }
      throw new Error("Unknown operator " + node.operator);
    }
    checkGiveUp(expression, chance, errorTexts) {
      if (Math.random() < chance * expression.complexityMultiplier) {
        LazyError.throwNew(errorTexts, () => {
          expression.complexityMultiplier *= 0.75;
          expression.update();
        });
      }
    }
  };
  var tokenPatterns = [
    {
      pattern: /(?<FUN>(?<FNNAME>[a-z]\w*)\s*\(\s*(?<FNARGS>.*)\s*\))/,
      type: "FUN"
    },
    { pattern: /(?<VAR>[a-z]\w*)/, type: "VAR" },
    { pattern: /(?<NUM>\d+(\.\d+)?)/, type: "NUM" },
    { pattern: /(?<ADD>\+)/, type: "ADD" },
    { pattern: /(?<SUB>-)/, type: "SUB" },
    { pattern: /(?<MUL>\*)/, type: "MUL" },
    { pattern: /(?<DIV>\/)/, type: "DIV" },
    { pattern: /(?<EXP>\^)/, type: "EXP" },
    { pattern: /(?<LPAREN>\()/, type: "LPAREN" },
    { pattern: /(?<RPAREN>\))/, type: "RPAREN" },
    { pattern: /(?<INVALID>[^\s])/, type: "INVALID" }
  ];
  var tokenizer = new RegExp(
    tokenPatterns.map(({ pattern }) => pattern.source).join("|"),
    "gim"
  );

  // expression.ts
  var Expression = class _Expression {
    calculator;
    element = null;
    resultElement = null;
    errorWrapper = null;
    definedFunction = null;
    arguments = [];
    // Stores function arguments if this is a function. Kinda yucky
    definedVariable = null;
    expressionContent = "";
    // Just the epxression itself, i.e. "5+x" in "f(x)=5+x"
    expressionString;
    // Stores the full string of this expression, including declarations
    value;
    // Gradually lowers when retrying (make this happen in the expression itself to avoid leakage)
    complexityMultiplier = 1;
    coffeeMode;
    usedBy = /* @__PURE__ */ new Set();
    static template = document.querySelector(
      "#expression-template"
    );
    constructor(calculator2, expressionString, addVisual = true, coffeeMode = false, requestingExpression = this) {
      this.calculator = calculator2;
      this.expressionString = expressionString;
      this.coffeeMode = coffeeMode;
      this.value = 0;
      if (coffeeMode) this.complexityMultiplier = 0;
      if (addVisual) {
        this.element = _Expression.template.content.cloneNode(true).querySelector(".expression");
        this.resultElement = this.element.querySelector(".expression-result");
        if (this.resultElement === null)
          throw new CalculatorError(
            "Result element not found on expression template!"
          );
        this.errorWrapper = this.element.querySelector(
          ".expression-error-wrapper"
        );
        if (this.errorWrapper === null)
          throw new CalculatorError(
            "Error element not found on expression template!"
          );
        this.element.querySelector(
          ".expression-edit-field"
        ).onchange = (e) => {
          const target = e.target;
          this.setContent(target.value);
        };
        this.element.querySelector(
          ".remove-expression"
        ).onclick = this.remove;
        calculator2.addExpressionElement(this.element);
      }
      this.update(requestingExpression);
    }
    getCalculator() {
      return this.calculator;
    }
    getArgumentNames() {
      return this.arguments;
    }
    getComplexityMultiplier() {
      return this.complexityMultiplier;
    }
    addDependency(e) {
      this.usedBy.add(e);
    }
    getValue(requestingExpression, context) {
      if (this.definedVariable) return this.value;
      return new Parser(this.expressionContent).evaluate(
        requestingExpression,
        context
      );
    }
    showError(e) {
      if (this.errorWrapper) {
        this.errorWrapper.classList.remove("hidden");
        this.errorWrapper.onclick = () => this.showErrorPopup(e);
      }
      if (!(e instanceof LazyError)) {
        this.calculator.registerErroredExpression(this);
      }
    }
    showErrorPopup(e) {
      if (this.errorWrapper) {
        this.calculator.showErrorPopup(e, this.errorWrapper);
      }
    }
    hideError() {
      this.calculator.unregisterErroredExpression(this);
      this.errorWrapper?.classList.add("hidden");
      this.calculator.hideErrorPopup();
    }
    showResult(resultText) {
      if (this.resultElement) {
        this.resultElement.innerText = resultText;
        this.resultElement.classList.remove("hidden");
      }
    }
    hideResult() {
      this.resultElement?.classList.add("hidden");
    }
    setContent(newContent, requestingExpression = this) {
      this.expressionString = newContent;
      this.update(requestingExpression);
      this.updateDirtyExpressions();
    }
    remove() {
      const calc = this.calculator;
      if (this.element) calc.removeExpressionElement(this.element);
      if (this.definedFunction) {
        calc.globalContext.deleteGlobalFunction(this.definedFunction);
      } else if (this.definedVariable) {
        calc.globalContext.deleteGlobalVariable(this.definedVariable);
      }
      this.updateDirtyExpressions();
    }
    updateDirtyExpressions() {
      for (const user of this.usedBy) user.update();
      while (true) {
        let restartLoop = false;
        for (const expr of this.calculator.getErroredExpressions()) {
          if (expr.update()) {
            restartLoop = true;
            break;
          }
        }
        if (!restartLoop) break;
      }
    }
    update(requestingExpression = this) {
      this.hideError();
      this.hideResult();
      if (this.definedVariable) {
        this.calculator.globalContext.deleteGlobalVariable(
          this.definedVariable
        );
        this.definedVariable = null;
      } else if (this.definedFunction) {
        this.calculator.globalContext.deleteGlobalFunction(
          this.definedFunction
        );
        this.definedFunction = null;
      }
      try {
        const typeMatcher = /^\s*(?<VRNAME>\w*)\s*=\s*(?<VRDEF>.*)$|^\s*(?<FNNAME>\w*)\s*\(\s*(?<FNARGS>(?:\w*(?:\s*,\s*\w*\s*)*)?)\s*\)\s*=\s*(?<FNDEF>.*)/im;
        const nameMatcher = /^[a-z]/gim;
        const typeMatch = this.expressionString.match(typeMatcher);
        if (typeMatch) {
          if (!typeMatch.groups)
            throw new Error("Pre-evaluation regex match failed!");
          const { groups } = typeMatch;
          const [fieldName, nameOfField] = groups.FNNAME ? [groups.FNNAME, "function"] : [groups.VRNAME, "variable"];
          if (!fieldName.match(nameMatcher))
            throw new CalculatorError(
              `"${fieldName}" is not a valid ${nameOfField} name!`
            );
          if (groups.FNNAME) {
            const fnArgs = groups.FNARGS.split(",").map((e) => {
              e = e.trim();
              if (!e.match(nameMatcher))
                throw new CalculatorError(
                  `"${e}" is not a valid argument name!`
                );
              return e;
            });
            if (groups.FNARGS)
              this.updateFunction(
                groups.FNNAME,
                fnArgs,
                groups.FNDEF
              );
          } else {
            this.updateVariable(
              requestingExpression,
              groups.VRNAME,
              groups.VRDEF
            );
          }
        } else {
          this.updateExpression(requestingExpression);
        }
        if (!this.coffeeMode) this.complexityMultiplier = 1;
        return true;
      } catch (e) {
        if (!this.element) throw e;
        if (!(e instanceof Error)) throw e;
        this.showError(e);
        return false;
      }
    }
    updateFunction(fnName, fnArgs, fnDef) {
      this.calculator.globalContext.defineGlobalFunction(fnName, this);
      this.definedFunction = fnName;
      this.arguments = fnArgs;
      this.expressionContent = fnDef;
    }
    updateVariable(requestingExpression, vrName, vrDef) {
      this.expressionContent = vrDef;
      this.value = this.getValue(
        requestingExpression,
        this.calculator.globalContext
      );
      this.calculator.globalContext.defineGlobalVariable(vrName, this);
      this.definedVariable = vrName;
      this.showResult(
        `${this.definedVariable} = ${getRoundedString(this.value)}`
      );
    }
    updateExpression(requestingExpression) {
      this.expressionContent = this.expressionString;
      this.value = this.getValue(
        requestingExpression,
        this.calculator.globalContext
      );
      this.showResult(`= ${getRoundedString(this.value)}`);
    }
  };
  var JSFunctionExpression = class _JSFunctionExpression extends Expression {
    runnable;
    failChance;
    additionalErrorTexts;
    constructor(calculator2, fnArguments, runnable, addVisual = false, coffeeMode = true, failChance = 0, lazyErrorTexts = []) {
      super(calculator2, "", addVisual, coffeeMode);
      this.arguments = fnArguments;
      this.runnable = runnable;
      this.failChance = failChance;
      this.additionalErrorTexts = lazyErrorTexts;
    }
    static simpleMaths(calc, fn, failChance = 0) {
      return new _JSFunctionExpression(
        calc,
        ["x"],
        (e, ctx) => fn(ctx.getVariable("x").getValue(e, ctx)),
        false,
        true,
        failChance
      );
    }
    // Yucky solution until I split expressions, functions and variables into
    // subclasses
    update() {
      return true;
    }
    getValue(requestingExpression, context) {
      if (Math.random() < this.failChance)
        LazyError.throwNew(this.additionalErrorTexts, () => {
          requestingExpression.update();
        });
      return this.runnable(requestingExpression, context);
    }
  };
  function getRoundedString(x) {
    if (x > 1e11) return "Too much to bother";
    let rounded = x.toPrecision(12);
    rounded = rounded.replace(/\.0*$|(\.\d*?)0+$/, "$1");
    return rounded;
  }

  // calculator.ts
  var CalculatorError = class extends Error {
    constructor(message) {
      super(message);
    }
  };
  var LazyError = class _LazyError extends CalculatorError {
    options = [];
    constructor(message, options) {
      super(message);
      this.options = options;
    }
    static universalMessages = [
      "Do I really need to do this?",
      "Calculator zoned out",
      "Calculator is tired today",
      "Maths is hard",
      "When will you ever use this in real life?",
      "Calculator too tired",
      "Calculator couldn't be bothered",
      "Calculator is confused"
    ];
    static universalButtonContent = [
      "Try again!",
      "You can do this!",
      "You can do it!",
      "Keep trying!",
      "Keep going!",
      "Don't give up!",
      "Stop complaining!",
      "Don't stop now!",
      "I believe in you!",
      "Don't despair!"
    ];
    // Add response buttons
    addOptionsToElement(errorButtonTemplate, el) {
      for (const option of this.options) {
        const button = errorButtonTemplate.content.cloneNode(
          true
        );
        const buttonElement = button.firstElementChild;
        buttonElement.setAttribute("value", option.name);
        buttonElement.onclick = option.callback;
        el.appendChild(button);
      }
    }
    static throwNew(additionalErrorTexts, buttonCallback) {
      const combinedErrorTexts = this.universalMessages.concat(additionalErrorTexts);
      throw new _LazyError(
        combinedErrorTexts[Math.floor(Math.random() * combinedErrorTexts.length)],
        [
          {
            name: _LazyError.universalButtonContent[Math.floor(
              Math.random() * _LazyError.universalButtonContent.length
            )],
            callback: buttonCallback
          }
        ]
      );
    }
  };
  var CalculatorContext3 = class _CalculatorContext {
    layers = [];
    addLayer = (layer) => {
      this.layers.unshift(layer);
    };
    defineGlobalFunction(name, expression) {
      const fns = this.layers[0].functions;
      if (fns[name]) {
        throw new CalculatorError(`Function "${name}" is already defined!`);
      }
      fns[name] = expression;
    }
    deleteGlobalFunction(name) {
      delete this.layers[0].functions[name];
    }
    defineGlobalVariable(name, expression) {
      const vars = this.layers[0].variables;
      if (vars[name]) {
        throw new CalculatorError(`Variable ${name} is already defined!`);
      }
      vars[name] = expression;
    }
    deleteGlobalVariable(name) {
      delete this.layers[0].variables[name];
    }
    getVariable(name) {
      for (const l of this.layers) {
        if (l.variables[name]) return l.variables[name];
      }
      throw new CalculatorError(`Variable "${name}" not found!`);
    }
    getFunction(name) {
      for (const l of this.layers) {
        if (l.functions[name]) return l.functions[name];
      }
      throw new CalculatorError(`Function "${name}" not found!`);
    }
    copy() {
      const newCtx = new _CalculatorContext();
      newCtx.layers = [...this.layers];
      return newCtx;
    }
  };
  var Calculator2 = class _Calculator {
    expressionListElement;
    errorPopupElement;
    erroredExpressions = [];
    globalContext = new CalculatorContext3();
    static errorButtonTemplate = document.querySelector(
      "#error-button-template"
    );
    constructor(expressionList2, errorPopupElement2) {
      this.expressionListElement = expressionList2;
      this.errorPopupElement = errorPopupElement2;
      this.globalContext.addLayer({
        functions: {
          sin: JSFunctionExpression.simpleMaths(this, Math.sin, 0.5),
          cos: JSFunctionExpression.simpleMaths(this, Math.cos, 0.5),
          tan: JSFunctionExpression.simpleMaths(this, Math.tan, 0.6),
          arcsin: JSFunctionExpression.simpleMaths(this, Math.asin, 0.5),
          arccos: JSFunctionExpression.simpleMaths(this, Math.acos, 0.5),
          arctan: JSFunctionExpression.simpleMaths(this, Math.atan, 0.6),
          abs: JSFunctionExpression.simpleMaths(this, Math.abs),
          round: JSFunctionExpression.simpleMaths(this, Math.round),
          ln: JSFunctionExpression.simpleMaths(this, Math.log, 0.7),
          log: JSFunctionExpression.simpleMaths(this, Math.log10, 0.7),
          sqrt: JSFunctionExpression.simpleMaths(this, Math.sqrt, 0.4),
          cbrt: JSFunctionExpression.simpleMaths(this, Math.cbrt, 0.5),
          round2: new JSFunctionExpression(
            this,
            ["x", "places"],
            (e, ctx) => {
              const p = Math.pow(
                10,
                ctx.getVariable("places").getValue(e, ctx)
              );
              return Math.round(
                ctx.getVariable("x").getValue(e, ctx) * p
              ) / p;
            }
          )
        },
        variables: {
          TAU: new Expression(this, "6.283185307179586", false, true),
          PI: new Expression(this, "3.141592653589793", false, true),
          PAU: new Expression(this, "4.71238898038469", false, true),
          E: new Expression(this, "2.718281828459045", false, true),
          PHI: new Expression(this, "1.618033988749895", false, true)
        }
      });
    }
    addExpressionElement(el) {
      this.expressionListElement.appendChild(el);
    }
    removeExpressionElement(el) {
      this.expressionListElement.removeChild(el);
    }
    registerErroredExpression(e) {
      if (this.erroredExpressions.indexOf(e) == -1) {
        this.erroredExpressions.push(e);
      }
    }
    unregisterErroredExpression(e) {
      const i = this.erroredExpressions.indexOf(e);
      if (i > -1) {
        this.erroredExpressions.splice(i, 1);
      }
    }
    getErroredExpressions() {
      return this.erroredExpressions;
    }
    showErrorPopup(e, sourceElement) {
      const errorWrapperRect = sourceElement.getBoundingClientRect();
      const isCalcError = e instanceof CalculatorError;
      this.errorPopupElement.innerHTML = "";
      this.errorPopupElement.style.top = errorWrapperRect.bottom + "px";
      this.errorPopupElement.style.left = errorWrapperRect.left + errorWrapperRect.width * 0.5 + "px";
      this.errorPopupElement.innerText = (isCalcError ? "ERROR: " : "INTERNAL ERROR: ") + e.message;
      if (e instanceof LazyError) {
        e.addOptionsToElement(
          _Calculator.errorButtonTemplate,
          this.errorPopupElement
        );
      }
      this.errorPopupElement.classList.remove("hidden");
    }
    hideErrorPopup() {
      this.errorPopupElement.classList.add("hidden");
    }
    /**
     * Add a new, empty expression to this calculator.
     */
    addExpression() {
      new Expression(this, "");
    }
  };

  // index.ts
  var expressionList = document.getElementById("expressions");
  if (!expressionList) throw new Error("Couldn't find expression list!");
  var errorPopupElement = document.getElementById("expression-error-popup");
  if (!errorPopupElement) throw new Error("Couldn't find error popup!");
  var calculator = new Calculator2(expressionList, errorPopupElement);
  var expressionAdder = document.getElementById("expression-adder");
  if (expressionAdder) expressionAdder.onclick = () => calculator.addExpression();
  var introCollapser = document.getElementById("collapse-intro");
  var introduction = document.getElementById("introduction");
  if (introCollapser && introduction)
    introCollapser.onclick = () => introduction.classList.toggle("hidden");
  document.addEventListener("mousedown", (e) => {
    const bounds = errorPopupElement.getBoundingClientRect();
    const x = e.clientX, y = e.clientY;
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
      errorPopupElement.classList.add("hidden");
    }
  });
  calculator.addExpression();
})();
