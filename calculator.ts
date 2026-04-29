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
    options: ErrorCallback[] = [];
    constructor(message: string, options: ErrorCallback[]) {
        super(message);
        this.options = options;
    }

    static universalMessages: string[] = [
        "Do I really need to do this?",
        "Calculator zoned out",
        "Calculator is tired today",
        "Maths is hard",
        "When will you ever use this in real life?",
        "Calculator too tired",
        "Calculator couldn't be bothered",
        "Calculator is confused",
    ];

    static universalButtonContent: string[] = [
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

    static throwNew = (
        additionalErrorTexts: string[],
        buttonCallback: () => void,
    ) => {
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
    };
}

export class CalculatorContext {
    layers: CalculatorContextLayer[] = [];

    addBlankLayer = () => {
        this.addLayer({
            variables: {},
            functions: {},
        });
    };

    addLayer = (layer: CalculatorContextLayer) => {
        this.layers.unshift(layer);
    };

    getVariable = (name: string) => {
        for (const l of this.layers) {
            if (l.variables[name]) return l.variables[name];
        }
        throw new CalculatorError(`Variable "${name}" not found!`);
    };

    getFunction = (name: string) => {
        for (const l of this.layers) {
            if (l.functions[name]) return l.functions[name];
        }
        throw new CalculatorError(`Function "${name}" not found!`);
    };

    copy = () => {
        const newCtx = new CalculatorContext();
        newCtx.layers = [...this.layers];
        return newCtx;
    };
}

export type CalculatorContextLayer = {
    variables: { [key: string]: Expression };
    functions: { [key: string]: Expression };
};

export class Calculator {
    expressionListElement: HTMLElement;
    errorPopupElement: HTMLElement;

    erroredExpressions: Expression[] = [];

    globalContext: CalculatorContext = new CalculatorContext();

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
    removeExpression(expression: Expression) {
        expression.remove();
    }

    /**
     * Set the content of the given expression to something new.
     * @param expression The expression to change
     * @param newValue The new content of this expression
     */
    setExpressionContent(expression: Expression, newValue: string) {
        expression.setContent(newValue);
    }
}
