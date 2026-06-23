new Worker(new URL("data:text/javascript,setTimeout(() => { throw new Error('Boom'); }, 1000);"));
