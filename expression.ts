import {
    Calculator,
    CalculatorError,
    LazyError,
    CalculatorContext,
} from "./calculator";
import { Parser } from "./parser";

export class Expression {
    private readonly calculator: Calculator;

    private readonly element: HTMLElement | null = null;
    private readonly resultElement: HTMLElement | null = null;
    private readonly errorWrapper: HTMLElement | null = null;

    private definedFunction: string | null = null;
    protected arguments: string[] = []; // Stores function arguments if this is a function. Kinda yucky

    private definedVariable: string | null = null;

    private expressionContent: string = ""; // Just the epxression itself, i.e. "5+x" in "f(x)=5+x"
    private expressionString: string; // Stores the full string of this expression, including declarations
    private value: number;

    // Gradually lowers when retrying (make this happen in the expression itself to avoid leakage)
    public complexityMultiplier = 1;
    private readonly coffeeMode: boolean;

    private readonly usedBy: Set<Expression> = new Set();

    private static readonly template = document.querySelector(
        "#expression-template",
    ) as HTMLTemplateElement;

    constructor(
        calculator: Calculator,
        expressionString: string,
        addVisual: boolean = true,
        coffeeMode: boolean = false, // whether laziness is possible
        requestingExpression: Expression = this, // if this is a hidden or intermediate expression (like a function argument), it may need to bring along a requesting expression
    ) {
        this.calculator = calculator;
        this.expressionString = expressionString;

        this.coffeeMode = coffeeMode;
        this.value = 0;

        if (coffeeMode) this.complexityMultiplier = 0;

        if (addVisual) {
            this.element = (
                Expression.template.content.cloneNode(true) as HTMLElement
            ).querySelector(".expression")!;

            this.resultElement =
                this.element.querySelector(".expression-result")!;
            if (this.resultElement === null)
                throw new CalculatorError(
                    "Result element not found on expression template!",
                );

            this.errorWrapper = this.element.querySelector(
                ".expression-error-wrapper",
            )!;
            if (this.errorWrapper === null)
                throw new CalculatorError(
                    "Error element not found on expression template!",
                );

            // Add a listener to set the contents of the expression when it changes
            this.element.querySelector<HTMLInputElement>(
                ".expression-edit-field",
            )!.onchange = (e) => {
                const target = e.target as HTMLInputElement;
                this.setContent(target.value);
            };

            // Add a listener for removing the expression when the cross is clicked
            this.element.querySelector<HTMLElement>(
                ".remove-expression",
            )!.onclick = this.remove;
            // Add the graphical expression to the DOM
            calculator.addExpressionElement(this.element);
        }

        // Automatically parse and evaluate the expression
        this.update(requestingExpression);
    }

    public getCalculator() {
        return this.calculator;
    }

    public getArgumentNames() {
        return this.arguments;
    }

    public getComplexityMultiplier() {
        return this.complexityMultiplier;
    }

    public addDependency(e: Expression) {
        this.usedBy.add(e);
    }

    public getValue(
        requestingExpression: Expression,
        context: CalculatorContext,
    ): number {
        // If it's a variable, the value is stored
        if (this.definedVariable) return this.value;

        return new Parser(this.expressionContent).evaluate(
            requestingExpression,
            context,
        );
    }

    private showError(e: Error) {
        if (this.errorWrapper) {
            this.errorWrapper.classList.remove("hidden");
            this.errorWrapper.onclick = () => this.showErrorPopup(e);
        }

        // If the error wasn't lazy, we want to reevaluate it when
        // something changes in the rest of the calculator, so we add it
        // to the calculator's erroredExpression list if it wasn't already present
        if (!(e instanceof LazyError)) {
            this.calculator.registerErroredExpression(this);
        }
    }

    private showErrorPopup(e: Error) {
        if (this.errorWrapper) {
            this.calculator.showErrorPopup(e, this.errorWrapper);
        }
    }

    private hideError() {
        // If this expression was present in the errored expression list, remove it
        this.calculator.unregisterErroredExpression(this);

        this.errorWrapper?.classList.add("hidden");
        // Also hides error popup, even if the popup isn't currently focused on the
        // expression
        // If this feels weird, make it so that the error only hides when on this
        this.calculator.hideErrorPopup();
    }

    private showResult(resultText: string) {
        if (this.resultElement) {
            this.resultElement.innerText = resultText;
            this.resultElement.classList.remove("hidden");
        }
    }

    private hideResult() {
        this.resultElement?.classList.add("hidden");
    }

    public setContent(
        newContent: string,
        requestingExpression: Expression = this,
    ) {
        this.expressionString = newContent;
        this.update(requestingExpression);
        this.updateDirtyExpressions();
    }

    private remove() {
        const calc = this.calculator;

        // Remove the element visual
        if (this.element) calc.removeExpressionElement(this.element);

        // Remove any field definitions from the expression
        if (this.definedFunction) {
            calc.globalContext.deleteGlobalFunction(this.definedFunction);
        } else if (this.definedVariable) {
            calc.globalContext.deleteGlobalVariable(this.definedVariable);
        }

        this.updateDirtyExpressions();
    }

    private updateDirtyExpressions() {
        // Update all expressions that used this one
        for (const user of this.usedBy) user.update();

        // Update all errored expressions
        while (true) {
            let restartLoop = false;
            for (const expr of this.calculator.getErroredExpressions()) {
                // If an update succeeds, that could mean that other expressions
                // would also succeed. This means we have to restart
                if (expr.update()) {
                    restartLoop = true;
                    break;
                }
            }
            if (!restartLoop) break;
        }
    }

    public update(requestingExpression: Expression = this): boolean {
        this.hideError();
        this.hideResult();

        // Delete any old variable or function that this expression defined
        if (this.definedVariable) {
            this.calculator.globalContext.deleteGlobalVariable(
                this.definedVariable,
            );
            this.definedVariable = null;
        } else if (this.definedFunction) {
            this.calculator.globalContext.deleteGlobalFunction(
                this.definedFunction,
            );
            this.definedFunction = null;
        }

        try {
            // FUNCTION MATCHER:
            // /^\s*(?<FNNAME>\w*)\s*\(\s*(?<FNARGS>(?:\w*(?:\s*,\s*\w*\s*)*)?)\s*\)\s*=\s*(?<FNDEF>.*)$/gmi

            // VARIABLE MATCHER:
            // /^\s*(?<VRNAME>\w*)\s*=\s*(?<VRDEF>.*)$/gmi

            // NAME MATCHER (I do an extra pass to register illegal field names,
            // rather than failing later with an opaque message)
            // /^[a-z]\w*$/gmi

            // If none of the above match, the expression is assumed to be a
            // standalone expression.

            const typeMatcher =
                /^\s*(?<VRNAME>\w*)\s*=\s*(?<VRDEF>.*)$|^\s*(?<FNNAME>\w*)\s*\(\s*(?<FNARGS>(?:\w*(?:\s*,\s*\w*\s*)*)?)\s*\)\s*=\s*(?<FNDEF>.*)/im;

            const nameMatcher = /^[a-z]/gim;

            const typeMatch = this.expressionString.match(typeMatcher);

            if (typeMatch) {
                if (!typeMatch.groups)
                    throw new Error("Pre-evaluation regex match failed!");

                const { groups } = typeMatch;

                // Throw error in case of invalid field name
                const [fieldName, nameOfField] = groups.FNNAME
                    ? [groups.FNNAME, "function"]
                    : [groups.VRNAME, "variable"];
                if (!fieldName.match(nameMatcher))
                    throw new CalculatorError(
                        `"${fieldName}" is not a valid ${nameOfField} name!`,
                    );

                // Check if the field declaration is a function or a variable
                if (groups.FNNAME) {
                    // Check the arguments' names
                    const fnArgs = groups.FNARGS.split(",").map((e) => {
                        e = e.trim();
                        if (!e.match(nameMatcher))
                            throw new CalculatorError(
                                `"${e}" is not a valid argument name!`,
                            );
                        return e;
                    });

                    if (groups.FNARGS)
                        // Was a function. Don't evaluate, just store in the global
                        // calculator context
                        this.updateFunction(
                            groups.FNNAME,
                            fnArgs,
                            groups.FNDEF,
                        );
                } else {
                    // Was a variable. Compute value, store self in global context
                    this.updateVariable(
                        requestingExpression,
                        groups.VRNAME,
                        groups.VRDEF,
                    );
                }
            } else {
                // Was just a normal expression
                this.updateExpression(requestingExpression);
            }

            // Reset complexity multiplier if parse succeeded
            if (!this.coffeeMode) this.complexityMultiplier = 1;

            // Return true, since the parse succeeded
            return true;
        } catch (e) {
            // Don't catch if this expression doesn't have a visual to error on
            if (!this.element) throw e;
            if (!(e instanceof Error)) throw e;

            this.showError(e);

            // Parse failed :(
            return false;
        }
    }

    private updateFunction(fnName: string, fnArgs: string[], fnDef: string) {
        // Define the function. No parsing happens here (it could though??)
        this.calculator.globalContext.defineGlobalFunction(fnName, this);

        this.definedFunction = fnName;
        this.arguments = fnArgs;
        this.expressionContent = fnDef;
    }

    private updateVariable(
        requestingExpression: Expression,
        vrName: string,
        vrDef: string,
    ) {
        // Calculate the value of this expression (throwing error if something went wrong)
        this.expressionContent = vrDef;
        this.value = this.getValue(
            requestingExpression,
            this.calculator.globalContext,
        );

        this.calculator.globalContext.defineGlobalVariable(vrName, this);
        this.definedVariable = vrName;

        // Show the result
        this.showResult(
            `${this.definedVariable} = ${getRoundedString(this.value)}`,
        );
    }

    private updateExpression(requestingExpression: Expression) {
        this.expressionContent = this.expressionString;
        this.value = this.getValue(
            requestingExpression,
            this.calculator.globalContext,
        );
        this.showResult(`= ${getRoundedString(this.value)}`);
    }
}

// Overrides the expression class to get JS(or TS)-defined functions to the calculator
export class JSFunctionExpression extends Expression {
    private runnable: Function;
    private failChance: number;
    private additionalErrorTexts: string[];

    constructor(
        calculator: Calculator,
        fnArguments: string[],
        runnable: Function,
        addVisual: boolean = false,
        coffeeMode: boolean = true, // whether laziness is possible
        failChance: number = 0, // the chance of a lazy error
        lazyErrorTexts: string[] = [], // Potential extra error messages to show when failing
    ) {
        super(calculator, "", addVisual, coffeeMode);
        this.arguments = fnArguments;
        this.runnable = runnable;
        this.failChance = failChance;
        this.additionalErrorTexts = lazyErrorTexts;
    }

    static simpleMaths(
        calc: Calculator,
        fn: Function,
        failChance: number = 0,
    ): JSFunctionExpression {
        return new JSFunctionExpression(
            calc,
            ["x"],
            (e: Expression, ctx: CalculatorContext) =>
                fn(ctx.getVariable("x").getValue(e, ctx)),
            false,
            true,
            failChance,
        );
    }

    // Yucky solution until I split expressions, functions and variables into
    // subclasses
    public override update() {
        return true;
    }

    public override getValue(
        requestingExpression: Expression,
        context: CalculatorContext,
    ) {
        if (Math.random() < this.failChance)
            LazyError.throwNew(this.additionalErrorTexts, () => {
                requestingExpression.update();
            });
        return this.runnable(requestingExpression, context);
    }
}

export function getRoundedString(x: number): string {
    if (x > 100000000000) return "Too much to bother";

    let rounded = x.toPrecision(12);

    // Remove trailing zeroes and point if present
    rounded = rounded.replace(/\.0*$|(\.\d*?)0+$/, "$1");

    return rounded;
}
