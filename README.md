[![Build Status](https://travis-ci.com/bsovs/mongoose-time-machine.svg?branch=main)](https://travis-ci.com/bsovs/mongoose-time-machine)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/3c4a540fdfd74b6f8f016d6644a313b2)](https://www.codacy.com/gh/bsovs/mongoose-time-machine/dashboard?utm_source=github.com&utm_medium=referral&utm_content=bsovs/mongoose-time-machine&utm_campaign=Badge_Grade)
[![Maintainability](https://api.codeclimate.com/v1/badges/d5933d4166719ff11775/maintainability)](https://codeclimate.com/github/bsovs/mongoose-time-machine/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/d5933d4166719ff11775/test_coverage)](https://codeclimate.com/github/bsovs/mongoose-time-machine/test_coverage)

# mongoose-time-machine

Stores and Manages all the differences and versions, any Mongo collection goes through it's lifecycle.

-   Based on the popular project [mongoose-diff-history](https://github.com/mimani/mongoose-diff-history)

## Installation

---

### npm

```sh
npm install mongoose-time-machine
```

## Operation

---

Each update will create a history record with [jsonDiff](https://github.com/benjamine/jsondiffpatch) of the change. This helps in tracking all the changes happened to an object from the beginning.

Following will be the structure of the diff history being saved:

diff Collection schema:

```
_id : mongo id of the diff object
collectionId : Mongo Id of the collection being modified
diff: diff object
user: User who modified
reason: Why the collection is modified
createdAt: When the collection is modified
_v: version
```

## Usage

---

Use as you would any Mongoose plugin:

```js
const mongoose = require('mongoose'),
      timeMachine = require('mongoose-time-machine'),
      schema = new mongoose.Schema({ ... });
      schema.plugin(timeMachine.plugin, { name: 'SchemaHistory' });
```

The plugin also has an omit option which accepts either a string or array. This will omit the given
keys from history. Follows dot syntax for deeply nested values.

```js
const mongoose = require('mongoose');
const timeMachine = require('mongoose-time-machine');

const schema = new mongoose.Schema({
    someField: String,
    ignoredField: String,
    some: {
        deepField: String
    }
});

schema.plugin(timeMachine.plugin, {
    name: 'MyModelHistory',
    omit: ['ignoredField', 'some.deepField']
});
const mongooseModel = mongoose.model('MyModel', schema);
```

You can pass in a mongoose adapter to use for your history models as well. This allows for models to be connected to different clusters/collections.

```js
const myAdapter = await mongoose.createConnection(
    `${uri}/${databaseName}?retryWrites=true`,
    {}
);

schema.plugin(timeMachine.plugin, {
    name: 'MyModelHistory',
    adapter: myAdapter
});
const mongooseModel = myAdapter.model('MyModel', schema);

// MyModelHistory model now lives at the same uri/databaseName as the mongooseModel created
```

## Helper Methods

---

You can get all the histories created for an object using following method:

```js
const expandableFields = ['abc', 'def'];

mongooseModel.getHistories(
    ObjectId,
    expandableFields,
    function (err, histories) {}
);

// or, as a promise
mongooseModel
    .getHistories(ObjectId, expandableFields)
    .then(histories => {})
    .catch(console.error);
```

If you just want the raw histories return with json diff patches:

```js
mongooseModel.getDiffs(ObjectId, function (err, histories) {});

// or, as a promise
mongooseModel
    .getDiffs(ObjectId)
    .then(histories => {})
    .catch(console.error);

// with optional query parameters:
mongooseModel
    .getDiffs(ObjectId, { select: 'diff user' })
    .then(histories => {})
    .catch(console.error);
```

You can get an older version of the object using following method:

```js
mongooseModel.getVersion(ObjectId, version, function (err, oldObject) {});

// or, as a promise
mongooseModel
    .getVersion(ObjectId, version)
    .then(oldObject => {})
    .catch(console.error);
```

You can also use Mongoose query options with getVersion like so:

```js
mongooseModel.getVersion(
    ObjectId,
    version,
    { lean: true },
    function (err, oldObject) {}
);

// or, as a promise
mongooseModel
    .getVersion(ObjectId, version, { lean: true })
    .then(oldObject => {})
    .catch(console.error);
```

## Access History Model

You can access the model's history-model by calling: `mongooseModel.history` on your attached model

From there you can call custom mongoose queries on the history model:

```js
mongooseModel.history
    .find({ diff: { name: 'foo' } })
    .limit(10)
    .then(oldObject => {})
    .catch(console.error);
```

## Example

---

The example found [here](https://github.com/bsovs/mongoose-time-machine/tree/master/example) is an express service (documentation [here](https://github.com/bsovs/mongoose-time-machine/blob/master/example/README.md)), demonstrating this plugin via an simple employee schema, checkout `example` directory in this repo.

## Contributing

---

This project is now using [Conventional Commit](https://www.conventionalcommits.org/en/v1.0.0/) syntax for commit messages, to allow for easier updates in change logs & release notes. Please follow these conventions in your commits.

### Test Locally

-   Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
-   Run `npm run dc:db-up` to start local mongoDB on port 27017
-   In the console type:
    -   `mongo`
    -   then copy paste
        ```sh
        rs.initiate(
          {
            _id : 'rs0',
            members: [
              { _id : 0, host : "mongo1:27017" },
              { _id : 1, host : "mongo2:27017" },
              { _id : 2, host : "mongo3:27017" }
            ]
          }
        )
        ```
-   You can view the database by connecting to `mongodb://localhost:27017,localhost:27018,localhost:27019/tekpub_test?replicaSet=rs0` through [mongo compass](https://www.mongodb.com/try/download/compass)
-   Run test suite with `npm run test`

### Available Commands

-   `dc:db-up` start local db
-   `dc:db-down` stop local db
-   `dc:db-destroy` delete local db
-   `test` run test suite
