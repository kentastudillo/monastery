let util = require('./util')
let rules = require('./rules')

module.exports = {

  validate: function(data, opts, cb) {
    /**
     * Validates a model
     * @param {instance} model
     * @param {object} data
     * @param {object} <opts> - { insert: true, skipValidation: ''|[], whitelist: []|true }
     * @param {function} <cb> - instead of returning a promise
     * @this model

     * @return promise(errors[] || pruned data{})
     */

    // Optional cb and opts
    if (util.isFunction(opts)) { cb = opts; opts = undefined }
    data = util.deepCopy(data)
    opts = opts || {}
    opts.insert = !opts.update
    opts.action = opts.update? 'update' : 'insert'
    opts.blacklist = [ ...this[`${opts.action}BL`] ]
    opts.skipValidation = util.toArray(opts.skipValidation||[])

    // Whitelisting. Returns a blacklist
    if (opts.whitelist) {
      if (opts.whitelist === true) opts.whitelist = opts.blacklist
      opts.blacklist = opts.blacklist.filter(o => !opts.whitelist.includes(o))
      // Remove any deep blacklisted fields that have a whitelisted parent specified.
      // E.g remove ['deep.deep2.deep3'] if ['deep'] exists in the whitelist
      for (let i=opts.blacklist.length; i--;) {
        let split = opts.blacklist[i].split('.')
        for (let j=split.length; j--;) {
          if (split.length > 1) split.pop()
          else continue
          if (opts.whitelist.includes(split.join())) {
            opts.blacklist.splice(i, 1)
            break;
          }
        }
      }
    }

    // Run before hook, then recurse through the model's fields
    return util.runSeries(this.beforeValidate.map(f => f.bind(opts, data))).then(() => {
      return util.toArray(data).map(item => {
        let validated = this._validateFields(this.fields, item, opts, '')
        if (validated[0].length) throw validated[0]
        else return validated[1]
      })

    // Success/error
    }).then(data2 => {
      let response = util.isArray(data)? data2 : data2[0]
      if (cb) cb(null, response)
      else return Promise.resolve(response)

    }).catch(errs => {
      if (cb) cb(errs)
      else throw errs
    })
  },

  _validateFields: function(fields, data, opts, path) {
    /**
     * Recurse through and retrieve any errors and valid data
     * @param {object|array} fields
     * @param {any} data
     * @param {object} opts
     * @param {string} path
     * @return [errors, valid-data]
     *
     *   Fields first recursion  = { pets: [{ name: {}, color: {} }] }
     *   Fields second recursion = [0]: { name: {}, color: {} }
     */
    let errors = []
    let data2 = util.isArray(fields)? [] : {}

    util.forEach(util.forceArray(data), function(data, i) {
      util.forEach(fields, function(field, fieldName) {
        let verrors = []
        let schema = field.schema || field
        let value = util.isArray(fields)? data : (data||{})[fieldName]
        let indexOrFieldName = util.isArray(fields)? i : fieldName
        let path2 = `${path}.${indexOrFieldName}`.replace(/^\./, '')
        let path3 = path2.replace(/(^|\.)[0-9]+(\.|$)/, '$2') // no numirical keys, e.g. pets.1.name
        let isType = 'is' + util.ucFirst(schema.type)
        let isTypeRule = this.rules[isType] || rules[isType]

        // Use the default if available
        if (util.isDefined(schema.default)) {
          if (schema.defaultOverride || (opts.insert && !util.isDefined(value))) {
            value = util.isFunction(schema.default)? schema.default() : schema.default
          }
        }

        // Ignore blacklisted
        if (opts.blacklist.indexOf(path3) >= 0 && !schema.defaultOverride) return
        // Ignore insert only
        if (opts.update && schema.insertOnly) return
        // Type cast the value if tryParse is avaliable, .e.g. isInteger.tryParse
        if (isTypeRule && util.isFunction(isTypeRule.tryParse)) value = isTypeRule.tryParse.call(this, value)

        // Schema field (ignore object/array schemas)
        if (util.isSchema(field) && fieldName !== 'schema') {
          errors.push(...(verrors = this._validateRules(schema, value, opts, path2)))
          if (util.isDefined(value) && !verrors.length) data2[indexOrFieldName] = value

        // Fields can be a subdocument
        } else if (util.isSubdocument(field)) {
          // Object schema errors
          errors.push(...(verrors = this._validateRules(schema, value, opts, path2)))
          // Data value is a subdocument, or force recursion when inserting (for required checks)
          if (util.isObject(value) || opts.insert) {
            var res = this._validateFields(field, value, opts, path2)
            errors.push(...res[0])
          }
          if (util.isDefined(value) && !verrors.length) {
            data2[indexOrFieldName] = res? res[1] : value
          }

        // Fields can be an array
        } else if (util.isArray(field)) {
          // Array schema errors
          errors.push(...(verrors = this._validateRules(schema, value, opts, path2)))
          // Data value is array too
          if (util.isArray(value)) {
            var res = this._validateFields(field, value, opts, path2)
            errors.push(...res[0])
          }
          if (util.isDefined(value) && !verrors.length) {
            data2[indexOrFieldName] = res? res[1] : value
          }
        }
      }, this)
    }, this)

    // Normalise array indexes and return
    if (util.isArray(fields)) data2 = data2.filter(() => true)
    if (data === null) data2 = null
    return [errors, data2]
  },

  _validateRules: function(field, value, opts, path) {
    /**
     * Validate all the field's rules
     * @param {object} field - field schema
     * @param {string} path - full field path
     * @this model
     * @return {array} errors
     */
    let errors = []

    // Skip validation for a field, takes in to account if a parent has been skipped.
    if (opts.skipValidation.length) {
      //console.log(path, field, opts)
      let pathChunks = path.split('.')
      for (let skippedField of opts.skipValidation) {
        // Make sure there is numerical character representing arrays
        let skippedFieldChunks = skippedField.split('.')
        for (let i=0, l=pathChunks.length; i<l; i++) {
          if (pathChunks[i].match(/^[0-9]+$/)
              && skippedFieldChunks[i]
              && !skippedFieldChunks[i].match(/^\$$|^[0-9]+$/)) {
            skippedFieldChunks.splice(i, 0, '$')
          }
        }
        for (let i=0, l=skippedFieldChunks.length; i<l; i++) {
          if (skippedFieldChunks[i] == '$') skippedFieldChunks[i] = '[0-9]+'
        }
        if (path.match(new RegExp('^' + skippedFieldChunks.join('.') + '(\.|$)'))) return []
      }
    }

    for (let ruleName in field) {
      if (this._ignoredRules.indexOf(ruleName) > -1) continue
      if (util.isUndefined(value) && opts.update) continue
      let error = this._validateRule(ruleName, field, field[ruleName], value, path)
      if (error && ruleName == 'required') return [error] // only show the required error
      if (error) errors.push(error)
    }
    return errors
  },

  _validateRule: function(ruleName, field, ruleArg, value, path) {
    //this.debug(path, field, ruleName, ruleArg, value)
    path = path.replace(/^\./, '[]')
    ruleArg = ruleArg === true? undefined : ruleArg
    let rule = this.rules[ruleName] || rules[ruleName]
    let fieldName = path.match(/[^\.]+$/)[0]
    let context = { model: this, fieldName: fieldName }
    let ruleMessagePath = path.replace(/\.[0-9]+(\.|$)/g, '.[]$1')
    let ruleMessage = this.messages[ruleMessagePath] && this.messages[ruleMessagePath][ruleName]
    if (!ruleMessage) ruleMessage = rule.message

    if (ruleName !== 'required') {
      // Ignore undefined when not testing 'required'
      if (typeof value === 'undefined') return

      // Ignore null if not testing required
      if (value === null && !field.isObject && !field.isArray) return

      // Ignore null if nullObject is set on objects or arrays
      if (value === null && field.nullObject) return
    }

    // Ignore empty strings
    if (value === '' && rule.ignoreEmptyString) return

    // Rule failed
    if (!rule.fn.call(context, value, ruleArg)) return {
      detail: util.isFunction(ruleMessage)? ruleMessage.call(context, value, ruleArg) : ruleMessage,
      meta: { rule: ruleName, model: this.name, field: fieldName },
      status: '400',
      title: path
    }
  },

  _ignoredRules: [
    // Need to remove fileSize and formats..
    'default', 'defaultOverride', 'fileSize', 'formats', 'image', 'index', 'insertOnly', 'model', 'nullObject', 'type'
  ]

}
