const omit = require('omit-deep-remove');
const pick = require('lodash.pick');
const empty = require('deep-empty-object');
const { assign } = require('power-assign');

// try to find an id property, otherwise just use the index in the array
const objectHash = (obj, idx) => obj._id || obj.id || `$$index: ${idx}`;
const diffPatcher = require('jsondiffpatch').create({ objectHash });

const historyModelGenerator = require('./diffHistoryModel');

module.exports = class DiffHistory {
    constructor(schema, opts = {}) {
        this.model = historyModelGenerator(schema, opts);
    }

    isValidCb = cb => {
        return cb && typeof cb === 'function';
    };

    //https://eslint.org/docs/rules/complexity#when-not-to-use-it
    /* eslint-disable complexity */
    checkRequired(opts, queryObject, updatedObject) {
        if (queryObject && !queryObject.options && !updatedObject) {
            return;
        }
        const { __user: user, __reason: reason } =
            (queryObject && queryObject.options) || updatedObject;
        if (
            opts.required &&
            ((opts.required.includes('user') && !user) ||
                (opts.required.includes('reason') && !reason))
        ) {
            return true;
        }
    }

    saveDiffObject(currentObject, original, updated, opts, queryObject) {
        const { __user: user, __reason: reason, __session: session } =
            (queryObject && queryObject.options) || currentObject;

        let diff = diffPatcher.diff(
            JSON.parse(JSON.stringify(original)),
            JSON.parse(JSON.stringify(updated))
        );

        if (opts.omit) {
            omit(diff, opts.omit, { cleanEmpty: true });
        }

        if (opts.pick) {
            diff = pick(diff, opts.pick);
        }

        if (!diff || !Object.keys(diff).length || empty.all(diff)) {
            return;
        }

        const collectionId = currentObject._id;
        const collectionName =
            currentObject.constructor.modelName || queryObject.model.modelName;

        return this.model
            .findOne({ collectionId, collectionName })
            .sort('-version')
            .then(lastHistory => {
                const history = new this.model({
                    collectionId,
                    collectionName,
                    diff,
                    user,
                    reason,
                    version: lastHistory ? lastHistory.version + 1 : 0
                });
                if (session) {
                    return history.save({ session });
                }
                return history.save();
            });
    }

    /* eslint-disable complexity */
    saveDiffHistory = (queryObject, currentObject, opts) => {
        const queryUpdate = queryObject.getUpdate();
        const schemaOptions = queryObject.model.schema.options || {};

        let keysToBeModified = [];
        let mongoUpdateOperations = [];
        let plainKeys = [];

        for (const key in queryUpdate) {
            const value = queryUpdate[key];
            if (key.startsWith('$') && typeof value === 'object') {
                const innerKeys = Object.keys(value);
                keysToBeModified = keysToBeModified.concat(innerKeys);
                if (key !== '$setOnInsert') {
                    mongoUpdateOperations = mongoUpdateOperations.concat(key);
                }
            } else {
                keysToBeModified = keysToBeModified.concat(key);
                plainKeys = plainKeys.concat(key);
            }
        }

        const dbObject = pick(currentObject, keysToBeModified);
        let updatedObject = assign(
            dbObject,
            pick(queryUpdate, mongoUpdateOperations),
            pick(queryUpdate, plainKeys)
        );

        let { strict } = queryObject.options || {};
        // strict in Query options can override schema option
        strict = strict !== undefined ? strict : schemaOptions.strict;

        if (strict === true) {
            const validPaths = Object.keys(queryObject.model.schema.paths);
            updatedObject = pick(updatedObject, validPaths);
        }

        return this.saveDiffObject(
            currentObject,
            dbObject,
            updatedObject,
            opts,
            queryObject
        );
    };

    saveDiffs = (queryObject, opts) =>
        queryObject
            .find(queryObject._conditions)
            .cursor()
            .eachAsync(result =>
                this.saveDiffHistory(queryObject, result, opts)
            );

    getVersion = (model, id, version, queryOpts, cb) => {
        if (typeof queryOpts === 'function') {
            cb = queryOpts;
            queryOpts = undefined;
        }

        return model
            .findById(id, null, queryOpts)
            .then(latest => {
                latest = latest || {};
                return this.model
                    .find(
                        {
                            collectionName: model.modelName,
                            collectionId: id,
                            version: { $gte: parseInt(version, 10) }
                        },
                        { diff: 1, version: 1 },
                        { sort: '-version' }
                    )
                    .lean()
                    .cursor()
                    .eachAsync(history => {
                        diffPatcher.unpatch(latest, history.diff);
                    })
                    .then(() => {
                        if (this.isValidCb(cb)) return cb(null, latest);
                        return latest;
                    });
            })
            .catch(err => {
                if (this.isValidCb(cb)) return cb(err, null);
                throw err;
            });
    };

    getDiffs = (modelName, id, opts, cb) => {
        opts = opts || {};
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        return this.model
            .find({ collectionName: modelName, collectionId: id }, null, opts)
            .lean()
            .then(histories => {
                if (this.isValidCb(cb)) return cb(null, histories);
                return histories;
            })
            .catch(err => {
                if (this.isValidCb(cb)) return cb(err, null);
                throw err;
            });
    };

    getHistories = (modelName, id, expandableFields, cb) => {
        expandableFields = expandableFields || [];
        if (typeof expandableFields === 'function') {
            cb = expandableFields;
            expandableFields = [];
        }

        const histories = [];

        return this.model
            .find({ collectionName: modelName, collectionId: id })
            .lean()
            .cursor()
            .eachAsync(history => {
                const changedValues = [];
                const changedFields = [];
                for (const key in history.diff) {
                    if (history.diff.hasOwnProperty(key)) {
                        if (expandableFields.indexOf(key) > -1) {
                            const oldValue = history.diff[key][0];
                            const newValue = history.diff[key][1];
                            changedValues.push(
                                key + ' from ' + oldValue + ' to ' + newValue
                            );
                        } else {
                            changedFields.push(key);
                        }
                    }
                }
                const comment =
                    'modified ' +
                    changedFields.concat(changedValues).join(', ');
                histories.push({
                    changedBy: history.user,
                    changedAt: history.createdAt,
                    updatedAt: history.updatedAt,
                    reason: history.reason,
                    comment: comment
                });
            })
            .then(() => {
                if (this.isValidCb(cb)) return cb(null, histories);
                return histories;
            })
            .catch(err => {
                if (this.isValidCb(cb)) return cb(err, null);
                throw err;
            });
    };
};
