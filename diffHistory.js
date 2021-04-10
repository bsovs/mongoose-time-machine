const mongoose = require('mongoose');
const DiffHistory = require('./diffHistoryObject');

/**
 * @param {Object} schema - Schema object passed by Mongoose Schema.plugin
 * @param {Object} [opts] - Options passed by Mongoose Schema.plugin
 * @param {string} [opts.name] - Name of history model created for the attached schema (ex. fooHistory)
 * @param {string|string[]} [opts.omit] - fields to omit from diffs (ex. ['a', 'b.c.d']).
 * @param {Object} [opts.schemaOpts] - Options passed to the mongoose history schema
 * @param {Object} [opts.connection] - Object used to create a new mongo connection through mongoose
 * @param {string} [opts.connection.uri] - URI for MongoDB (necessary, for instance, when not using mongoose.connect).
 * @param {string} [opts.connection.opts] - MongoDB connection options.
 * @param {func} [opts.connection.callback] - Callback for when plugin connection setup has completed
 */
plugin = (schema, opts = {}) => {
    if (!opts.name) opts.name = 'histories';

    if (opts.connection?.uri) {
        createNewConnection(opts.connection).finally();
    }

    if (opts.omit && !Array.isArray(opts.omit)) {
        if (typeof opts.omit === 'string') {
            opts.omit = [opts.omit];
        } else {
            const errMsg = `opts.omit expects string or array, instead got '${typeof opts.omit}'`;
            throw new TypeError(errMsg);
        }
    }

    const History = new DiffHistory(schema, opts);

    schema.statics.getVersion = function (id, version, queryOps, cb) {
        return History.getVersion(this, id, version, queryOps, cb);
    };
    schema.statics.getDiffs = function (id, opts, cb) {
        return History.getDiffs(this.modelName, id, opts, cb);
    };
    schema.statics.getHistories = function (id, expandableFields, cb) {
        return History.getHistories(this.modelName, id, expandableFields, cb);
    };
    schema.statics.history = History.model;

    schema.pre('save', function (next) {
        if (this.isNew) return next();
        this.constructor
            .findOne({ _id: this._id })
            .then(original => {
                if (History.checkRequired(opts, {}, this)) {
                    return;
                }
                return History.saveDiffObject(
                    this,
                    original,
                    this.toObject({ depopulate: true }),
                    opts
                );
            })
            .then(() => next())
            .catch(next);
    });

    const onUpdate = (model, next) => {
        if (History.checkRequired(opts, model)) {
            return next();
        }
        History.saveDiffs(model, opts)
            .then(() => next())
            .catch(next);
    };
    schema.pre('findOneAndUpdate', function (next) {
        onUpdate(this, next);
    });
    schema.pre('update', function (next) {
        onUpdate(this, next);
    });
    schema.pre('updateOne', function (next) {
        onUpdate(this, next);
    });

    const onDelete = (model, next) => {
        if (History.checkRequired(opts, model)) {
            return next();
        }
        History.saveDiffObject(model, model, {}, opts)
            .then(() => next())
            .catch(next);
    };
    schema.pre('remove', function (next) {
        onDelete(this, next);
    });
    schema.pre('deleteOne', function (next) {
        onDelete(this, next);
    });
};

const createNewConnection = async opts => {
    const mongoVersion = parseInt(mongoose.version);
    if (mongoVersion < 5) {
        await mongoose
            .connect(opts.uri, { useMongoClient: true })
            .then(() => {
                if (opts?.callback) opts.callback();
            })
            .catch(e => {
                console.error('mongoose-diff-history connection error:', e);
                if (opts?.callback) opts.callback(e);
            });
    } else {
        if (mongoose.connections) await mongoose.disconnect();
        await mongoose
            .connect(opts.uri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                ...opts.opts
            })
            .then(() => {
                if (opts?.callback) opts.callback();
            })
            .catch(e => {
                console.error('mongoose-diff-history connection error:', e);
                if (opts?.callback) opts.callback(e);
            });
    }
};

module.exports = {
    plugin
};
