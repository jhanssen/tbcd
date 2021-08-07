function assert(condition: any, msg?: string): asserts condition {
    if (!condition) {
        console.error(msg);
        process.exit();
    }
}

export default assert;
