import { Expression, JSFunctionExpression } from "./expression";

export class CalculatorError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export type ErrorCallback = {
    name: string;
    callback: () => void;
};

export class LazyError extends CalculatorError {
    private options: ErrorCallback[] = [];

    constructor(message: string, options: ErrorCallback[]) {
        super(message);
        this.options = options;
    }

    private static universalMessages: string[] = [
        "Do I really need to do this?",
        "Calculator zoned out",
        "Calculator is tired today",
        "Maths is hard",
        "When will you ever use this in real life?",
        "Calculator too tired",
        "Calculator couldn't be bothered",
        "Calculator is confused",
    ];

    private static universalButtonContent: string[] = [
        "Try again!",
        "You can do this!",
        "You can do it!",
        "Keep trying!",
        "Keep going!",
        "Don't give up!",
        "Stop complaining!",
        "Don't stop now!",
        "I believe in you!",
        "Don't despair!",
    ];

    // Add response buttons
    public addOptionsToElement(
        errorButtonTemplate: HTMLTemplateElement,
        el: HTMLElement,
    ) {
        for (const option of this.options) {
            // Create a new button
            const button = errorButtonTemplate.content.cloneNode(
                true,
            ) as HTMLElement;

            const buttonElement = button.firstElementChild as HTMLElement;
            buttonElement.setAttribute("value", option.name);
            buttonElement.onclick = option.callback;

            el.appendChild(button);
        }
    }

    public static throwNew(
        additionalErrorTexts: string[],
        buttonCallback: () => void,
    ) {
        const combinedErrorTexts =
            this.universalMessages.concat(additionalErrorTexts);

        throw new LazyError(
            combinedErrorTexts[
                Math.floor(Math.random() * combinedErrorTexts.length)
            ],
            [
                {
                    name: LazyError.universalButtonContent[
                        Math.floor(
                            Math.random() *
                                LazyError.universalButtonContent.length,
                        )
                    ],
                    callback: buttonCallback,
                },
            ],
        );
    }
}

export class CalculatorContext {
    private layers: CalculatorContextLayer[] = [];

    public addLayer = (layer: CalculatorContextLayer) => {
        this.layers.unshift(layer);
    };

    public defineGlobalFunction(name: string, expression: Expression) {
        const fns = this.layers[0].functions;
        if (fns[name]) {
            throw new CalculatorError(`Function "${name}" is already defined!`);
        }
        fns[name] = expression;
    }

    public deleteGlobalFunction(name: string) {
        delete this.layers[0].functions[name];
    }

    public defineGlobalVariable(name: string, expression: Expression) {
        // Make sure that the variable doesn't already exist
        const vars = this.layers[0].variables;
        if (vars[name]) {
            throw new CalculatorError(`Variable ${name} is already defined!`);
        }

        // Store this expression in the global calculator context
        vars[name] = expression;
    }

    public deleteGlobalVariable(name: string) {
        delete this.layers[0].variables[name];
    }

    public getVariable(name: string) {
        for (const l of this.layers) {
            if (l.variables[name]) return l.variables[name];
        }
        throw new CalculatorError(`Variable "${name}" not found!`);
    }

    public getFunction(name: string) {
        for (const l of this.layers) {
            if (l.functions[name]) return l.functions[name];
        }
        throw new CalculatorError(`Function "${name}" not found!`);
    }

    public copy() {
        const newCtx = new CalculatorContext();
        newCtx.layers = [...this.layers];
        return newCtx;
    }
}

export type CalculatorContextLayer = {
    variables: { [key: string]: Expression };
    functions: { [key: string]: Expression };
};

export class Calculator {
    private readonly expressionListElement: HTMLElement;
    private readonly errorPopupElement: HTMLElement;

    private readonly erroredExpressions: Expression[] = [];

    public readonly globalContext: CalculatorContext = new CalculatorContext();

    private static readonly errorButtonTemplate = document.querySelector(
        "#error-button-template",
    ) as HTMLTemplateElement;

    constructor(expressionList: HTMLElement, errorPopupElement: HTMLElement) {
        this.expressionListElement = expressionList;
        this.errorPopupElement = errorPopupElement;

        // Add some builtins
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
                    (e: Expression, ctx: CalculatorContext) => {
                        const p = Math.pow(
                            10,
                            ctx.getVariable("places").getValue(e, ctx),
                        );
                        return (
                            Math.round(
                                ctx.getVariable("x").getValue(e, ctx) * p,
                            ) / p
                        );
                    },
                ),
            },
            variables: {
                TAU: new Expression(this, "6.283185307179586", false, true),
                PI: new Expression(this, "3.141592653589793", false, true),
                PAU: new Expression(this, "4.71238898038469", false, true),
                E: new Expression(this, "2.718281828459045", false, true),
                PHI: new Expression(this, "1.618033988749895", false, true),
            },
        });
    }

    public addExpressionElement(el: HTMLElement) {
        this.expressionListElement.appendChild(el);
    }

    public removeExpressionElement(el: HTMLElement) {
        this.expressionListElement.removeChild(el);
    }

    public registerErroredExpression(e: Expression) {
        if (this.erroredExpressions.indexOf(e) == -1) {
            this.erroredExpressions.push(e);
        }
    }

    public unregisterErroredExpression(e: Expression) {
        const i = this.erroredExpressions.indexOf(e);
        if (i > -1) {
            this.erroredExpressions.splice(i, 1);
        }
    }

    public getErroredExpressions() {
        return this.erroredExpressions; // TODO: Copy list to avoid leakage?
        // Alternatively, this is just used when updating all errored expressions so
        // I could just move the code to here and get rid of this?? Might make more
        // sense as well
    }

    public showErrorPopup(e: Error, sourceElement: HTMLElement) {
        // Show the error on this error wrapper
        const errorWrapperRect = sourceElement.getBoundingClientRect();
        const isCalcError = e instanceof CalculatorError;

        this.errorPopupElement.innerHTML = "";

        this.errorPopupElement.style.top = errorWrapperRect.bottom + "px";
        this.errorPopupElement.style.left =
            errorWrapperRect.left + errorWrapperRect.width * 0.5 + "px";

        this.errorPopupElement.innerText =
            (isCalcError ? "ERROR: " : "INTERNAL ERROR: ") + e.message;

        // Add button options if it's a lazy error
        if (e instanceof LazyError) {
            e.addOptionsToElement(
                Calculator.errorButtonTemplate,
                this.errorPopupElement,
            );
        }

        // Show the popup
        this.errorPopupElement.classList.remove("hidden");
    }

    public hideErrorPopup() {
        this.errorPopupElement.classList.add("hidden");
    }

    /**
     * Add a new, empty expression to this calculator.
     */
    public addExpression() {
        new Expression(this, "");
    }
}
