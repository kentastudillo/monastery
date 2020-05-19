---
title: Schema
nav_order: 4
---

# Schema

Model schema object.

### Table of Contents

- [Fields](#fields)
- [Field blacklisting](#field-blacklisting)
- [Field options](#field-options)
- [Custom validation rules](#custom-validation-rules)
- [Custom error messages](#custom-error-messages)
- [Operation hooks](#operation-hooks)
- [Full example](#full-example)

### Fields

1. Fields may contain subdocuments, array of values, or an array of subdocuments
2. Field values need to have the `type` rule defined
3. Field values can contain [custom](#custom-validation-rules) and [default validation rules](/rules), e.g. `{ minLength: 2 }`
4. Field values can contain [field options](#field-options).

```js
schema.fields = {
  name: { // value
    type: 'string', 
    required: true 
  },
  address: { // subdocument
    line1: { type: 'string', required: true },
    city: { type: 'string', minLength: 2 }
  },
  names: [ // array of values
    { type: 'string' }
  ],
  pets: [{ // array of subdocuments
    name: { type: 'string' },
    type: { type: 'string' }
  }]
}
```

These fields are always enabled by default

```js
schema.fields = {
  createdAt: {
    type: 'integer',
    default: () => Math.floor(Date.now() / 1000)
  },
  updatedAt: {
    type: 'integer',
    default: () => Math.floor(Date.now() / 1000)
  }
}
```

### Field blacklisting

You are able to provide a list of fields to blacklist per model operation.

```js
// The 'password' field will be excluded from the response returned from `model.find`
schema.findBL = ['password']

// The 'password' and 'createdAt' fields will be automatically removed when updating via model.update
schema.updateBl = ['createdAt', 'password']

// The 'password' field will be automatically removed when inserting via model.insert
schema.createdBl = ['password']
```

### Field options

Here are some other special field options that can be used alongside validation rules.

```js
let fieldName = {
  // Monastery will automatically create a mongodb index for this field
  index: true,
  // Monastery will automatically create a unique mongodb index for this field
  unique: true,
  // Practically means type = 'id', but also enables population
  model: 'pet',
  // Practically means type = 'id', but also allows plugins to hook into this flag (more soon)
  image: true,
  // Field will only be allowed to be set on insert when calling model.insert
  insertOnly: true,
  // Default will always override any passed value (it has some use-cases)
  defaultOverride: true
  // Default value
  default: 12,
  // Default value return from a function
  default: () => "I'm a default value"
}
```

### Custom validation rules

You are able to define custom validation rules to use.

```js
schema.rules = {
  // Basic definition
  isGrandMaster: function(value, ruleArgument) {
    return (value == 'Martin Luther')? true : false
  },
  // Full definition
  isGrandMaster: {
    message: (value, ruleArgument) => 'Only grand masters are permitted'
    fn: function(value, ruleArgument) {
      return (value == 'Martin Luther')? true : false
    }
  }
}
```

### Custom error messages

You are able to define custom error messages for each validation rule.

```js
schema.messages = {
  "name": {
    required: 'Sorry, even a monk cannot be nameless'
    type: 'Sorry, your name needs to be a string, like it is so'
  },
  "address.city": {
    minLength: (value, ruleArgument) => {
      return `Is your city of residence really only ${ruleArgument} characters long?`
    }
  },
  "pets.[].name": {
    required: `Your pet's name needs to be a string, like it is so.`
  }
}
```

### Operation hooks

You are able provide an array of callbacks to these model operation hooks. `afterFind` is the only callback that is synchronous where `next()` doesn't need to be called. You can also access the operation details via `this` in each callback.

```js
schema.afterFind = [(opts, data) => { /*synchronous*/ }]
schema.afterInsert = [function(data, next) {}]
schema.afterUpdate = [function(data, next) {}]
schema.afterRemove = [function(data, next) {}]
schema.beforeInsert = [function(data, next) {}]
schema.beforeUpdate = [function(data, next) {}]
schema.beforeRemove = [function(data, next) {}]
schema.beforeValidate = [function(data, next) {}]
```

### Full example

```js
let schema = {
  fields: {
    email: { type: 'email', required: true, index: 'unique' },
    firstName: { type: 'string', required: true },
    lastName: { type: 'string' }
  },

  messages: {
    email: { required: 'Please enter an email.' }
  },

  updateBL: ['email'],

  beforeValidate: [function (data, next) {
    if (data.firstName) data.firstName = util.ucFirst(data.firstName)
    if (data.lastName) data.lastName = util.ucFirst(data.lastName)
    next()
  }],

  afterFind: [function(data) {// Synchronous
    data = data || {}
    data.name = data.firstName + " " + data.lastName
  }]
}

```