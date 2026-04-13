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
        dependency.usedBy.add(requestingExpression);
        return dependency.value;
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
        if (node.functionArguments.length !== e.arguments.length)
          throw new CalculatorError(
            `Argument count of ${node.functionName} is ${node.functionArguments.length}; expected ${e.arguments.length}`
          );
        e.usedBy.add(requestingExpression);
        const functionLayer = {
          variables: {},
          functions: {}
        };
        for (const i in e.arguments) {
          functionLayer.variables[e.arguments[i]] = new Expression(
            requestingExpression.calculator,
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
            `Dividing by ${Expression.getRoundedString(v2)} takes time`,
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
              `Calculator never multiplied by ${Expression.getRoundedString(v2)} before`
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
    // Gradually lowers when retrying
    complexityMultiplier = 1;
    coffeeMode;
    usedBy = /* @__PURE__ */ new Set();
    template = document.querySelector(
      "#expression-template"
    );
    errorButtonTemplate = document.querySelector(
      "#error-button-template"
    );
    constructor(calculator2, expressionString, addVisual = true, coffeeMode = false, requestingExpression = this) {
      this.calculator = calculator2;
      this.expressionString = expressionString;
      this.coffeeMode = coffeeMode;
      this.value = 0;
      if (coffeeMode) this.complexityMultiplier = 0;
      if (addVisual) {
        this.element = this.template.content.cloneNode(true).querySelector(".expression");
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
        ).onclick = () => {
          calculator2.removeExpression(this);
        };
        calculator2.expressionListElement.appendChild(this.element);
      }
      this.update(requestingExpression);
    }
    showError = (e) => {
      if (this.errorWrapper) {
        this.errorWrapper.classList.remove("hidden");
        this.errorWrapper.onclick = () => this.showErrorPopup(e);
      }
      if (!(e instanceof LazyError)) {
        if (this.calculator.erroredExpressions.indexOf(this) == -1) {
          this.calculator.erroredExpressions.push(this);
        }
      }
    };
    showErrorPopup = (e) => {
      if (this.errorWrapper) {
        const popup = this.calculator.errorPopupElement;
        popup.innerHTML = "";
        popup.classList.remove("hidden");
        const errorWrapperRect = this.errorWrapper.getBoundingClientRect();
        popup.style.top = errorWrapperRect.bottom + "px";
        popup.style.left = errorWrapperRect.left + errorWrapperRect.width * 0.5 + "px";
        if (e instanceof CalculatorError) {
          popup.innerText = "ERROR: " + e.message;
          if (e instanceof LazyError) {
            for (const option of e.options) {
              const button = this.errorButtonTemplate.content.cloneNode(
                true
              );
              const buttonElement = button.firstElementChild;
              buttonElement.setAttribute("value", option.name);
              buttonElement.onclick = option.callback;
              this.calculator.errorPopupElement.appendChild(button);
            }
          }
        } else if (e instanceof Error) {
          popup.innerText = "INTERNAL ERROR: \n" + e.message;
        }
      }
    };
    hideError = () => {
      const i = this.calculator.erroredExpressions.indexOf(this);
      if (i > -1) {
        this.calculator.erroredExpressions.splice(i, 1);
      }
      this.errorWrapper?.classList.add("hidden");
      this.calculator.errorPopupElement.classList.add("hidden");
    };
    showResult = (resultText) => {
      if (this.resultElement) {
        this.resultElement.innerText = resultText;
        this.resultElement.classList.remove("hidden");
      }
    };
    hideResult = () => {
      this.resultElement?.classList.add("hidden");
    };
    static getRoundedString = (x) => {
      if (x > 1e11) return "A lot";
      let rounded = x.toPrecision(12);
      rounded = rounded.replace(/\.0*$|(\.\d*?)0+$/, "$1");
      return rounded;
    };
    setContent = (newContent, requestingExpression = this) => {
      this.expressionString = newContent;
      if (this.update(requestingExpression)) {
        for (const expr of [...this.calculator.erroredExpressions]) {
          console.log(expr.expressionString);
          expr.update();
        }
      }
    };
    update = (requestingExpression = this) => {
      this.hideError();
      this.hideResult();
      try {
        const typeMatcher = /^\s*(?<VRNAME>[a-z]\w*)\s*=\s*(?<VRDEF>.*)$|^\s*(?<FNNAME>[a-z]\w*)\s*\(\s*(?<FNARGS>(?:[a-z]\w*(?:\s*,\s*[a-z]\w*\s*)*)?)\s*\)\s*=\s*(?<FNDEF>.*)/im;
        const typeMatch = this.expressionString.match(typeMatcher);
        if (typeMatch) {
          if (!typeMatch.groups)
            throw new Error("Pre-evaluation regex match failed!");
          const { groups } = typeMatch;
          if (this.definedVariable) {
            delete this.calculator.globalContext.layers[0].variables[this.definedVariable];
          } else if (this.definedFunction) {
            delete this.calculator.globalContext.layers[0].functions[this.definedFunction];
          }
          if (groups.FNNAME) {
            const fns = this.calculator.globalContext.layers[0].functions;
            if (fns[groups.FNNAME]) {
              throw new CalculatorError(
                `Function "${groups.FNNAME}" is already defined!`
              );
            }
            fns[groups.FNNAME] = this;
            this.definedFunction = groups.FNNAME;
            this.arguments = groups.FNARGS.split(",").map(
              (e) => e.trim()
            );
            this.expressionContent = groups.FNDEF;
          } else {
            const vars = this.calculator.globalContext.layers[0].variables;
            if (vars[groups.VRNAME]) {
              throw new CalculatorError(
                `Variable ${groups.VRNAME} is already defined!`
              );
            }
            vars[groups.VRNAME] = this;
            this.definedVariable = groups.VRNAME;
            this.expressionContent = groups.VRDEF;
            this.value = this.getValue(
              requestingExpression,
              this.calculator.globalContext
            );
            this.showResult(
              `${this.definedVariable} = ${_Expression.getRoundedString(this.value)}`
            );
          }
        } else {
          const ctx = this.calculator.globalContext.layers[0];
          if (this.definedVariable) {
            delete ctx.variables[this.definedVariable];
          } else if (this.definedFunction) {
            delete ctx.functions[this.definedFunction];
          }
          this.expressionContent = this.expressionString;
          this.value = this.getValue(
            requestingExpression,
            this.calculator.globalContext
          );
          this.showResult(`= ${_Expression.getRoundedString(this.value)}`);
        }
        for (const user of this.usedBy) {
          user.update();
        }
        if (!this.coffeeMode) this.complexityMultiplier = 1;
        return true;
      } catch (e) {
        if (!this.element) throw e;
        if (!(e instanceof Error)) throw e;
        this.showError(e);
        return false;
      }
    };
    getValue(requestingExpression, context) {
      return new Parser(this.expressionContent).evaluate(
        requestingExpression,
        context
      );
    }
  };
  var JSFunctionExpression = class _JSFunctionExpression extends Expression {
    runnable;
    failChance;
    lazyErrorTexts;
    constructor(calculator2, fnArguments, runnable, addVisual = false, coffeeMode = true, failChance = 0, lazyErrorTexts = []) {
      super(calculator2, "", addVisual, coffeeMode);
      this.arguments = fnArguments;
      this.runnable = runnable;
      this.failChance = failChance;
      this.lazyErrorTexts = lazyErrorTexts;
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
    getValue = (requestingExpression, context) => {
      if (Math.random() < this.failChance)
        LazyError.throwNew([], () => {
          requestingExpression.update();
        });
      return this.runnable(requestingExpression, context);
    };
  };

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
    static throwNew = (additionalErrorTexts, buttonCallback) => {
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
    };
  };
  var CalculatorContext3 = class _CalculatorContext {
    layers = [];
    addBlankLayer = () => {
      this.addLayer({
        variables: {},
        functions: {}
      });
    };
    addLayer = (layer) => {
      this.layers.unshift(layer);
    };
    getVariable = (name) => {
      for (const l of this.layers) {
        if (l.variables[name]) return l.variables[name];
      }
      throw new CalculatorError(`Variable "${name}" not found!`);
    };
    getFunction = (name) => {
      for (const l of this.layers) {
        if (l.functions[name]) return l.functions[name];
      }
      throw new CalculatorError(`Function "${name}" not found!`);
    };
    copy = () => {
      const newCtx = new _CalculatorContext();
      newCtx.layers = [...this.layers];
      return newCtx;
    };
  };
  var Calculator2 = class {
    expressionListElement;
    errorPopupElement;
    erroredExpressions = [];
    globalContext = new CalculatorContext3();
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
    /**
     * Add a new, empty expression to this calculator.
     */
    addExpression() {
      new Expression(this, "");
    }
    /**
     * Remove the given expression.
     * @param expression The expression to remove
     */
    removeExpression(expression) {
      if (expression.element)
        this.expressionListElement.removeChild(expression.element);
      if (expression.definedFunction) {
        delete this.globalContext.layers[0].functions[expression.definedFunction];
      } else if (expression.definedVariable) {
        delete this.globalContext.layers[0].variables[expression.definedVariable];
      }
      for (const expr of expression.usedBy) {
        expr.update();
      }
      for (const expr of this.erroredExpressions) {
        expr.update();
      }
    }
    /**
     * Set the content of the given expression to something new.
     * @param expression The expression to change
     * @param newValue The new content of this expression
     */
    setExpressionContent(expression, newValue) {
      expression.setContent(newValue);
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
