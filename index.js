  var PENDING = 0
  var FULFILLED = 1
  var REJECTED = 2
  var WAITING = 3
  
  var IPromise = function (fn) {
    // 只允许通过new 操作符调用IPromise
    if (!(this instanceof IPromise)) {
      throw new Error('must use new to get an IPromise instance!')
    }

    // fn只能是函数
    if (typeof fn !== 'function') {
      throw new Error('not a function')
    }

    // 实例属性声明
    this.status = PENDING
    this._deferred = []
    this.value = undefined

    // 执行fn，直接将this作为参数传入，就无需再去纠结函数内this的指向问题
    runFn(fn, this)
  }

  IPromise._immediateFn = function (fn) {
    setTimeout(fn, 0)
  }

  IPromise.prototype.then = function (onFulfilled, onReject) {
    var nextPromise = new IPromise(function () {})

    handle(this, new Deferred(nextPromise, onFulfilled, onReject))
    return nextPromise
  }

  // 为什么用prototype['catch']？因为catch是关键字，所以只能通过这种方式来添加
  IPromise.prototype['catch'] = function (onReject) {
    return IPromise.prototype.then(null ,onReject)
  }

  function Deferred(promise, onFulfilled, onReject) {
    this.promise = promise
    this.onFulfilled = onFulfilled || null
    this.onRejected = onReject || null
  }

  function runFn (fn, self) {
    // 使用done标志位，保证Promise实例的状态只更改一次
    var done = false

    // Promise为异步处理，内部发生的错误不应阻断主线程，所以这边使用try catch捕获错误
    try {
      fn(function (value) {
        if (!done) {
          done = true
          resolve(self, value)
        }
      }, function (error) {
        if (!done) {
          done = true
          reject(self, error)
        }
      })
    } catch (error) {
      if (!done) {
        done = true
        reject(self, error)
      }
    }
  }
  
  function reject (self, reason) {
    self.status = REJECTED
    self.value = reason
    doDeferred(self)
  }
  
  function resolve (self, newValue) {
    // 如果resolve的值为另外一个Promise，则切换状态为WAITING，表示依赖另外一个Promise的处理结果
    if (newValue instanceof IPromise) {
      self.status = WAITING
      self.value = newValue
      doDeferred(self)
      return
    }
    self.status = FULFILLED
    self.value = newValue
    doDeferred(self)
  }
  
  function doDeferred (self) {
    // 遍历执行回调
    for (var i = 0; i < self._deferred.length; i++) {
      handle(self, self._deferred[i])
    }
  }

  function handle(self, deferred) {
    // 如果当前Promise的value为另外一个Promise，则将self转换为依赖的Promise
    // 这时后续的处理就是针对依赖的Promise了
    while (self.status === WAITING) {
      self = self.value
    }
    // 用来处理当Promise还未处理完，就调用了then(onFulfilled, onRejected)方法的情况
    // ，这时会将then()方法注册的回调存放在_deferred数组中
    if (self.status === PENDING) {
      self._deferred.push(deferred)
      return
    }

    // Promise/A+标准规定，Promise必须是异步的，所以这边使用SetTimeout来将回调转为异步
    IPromise._immediateFn(function () {
      // 根据Promise的状态获取对应回调
      var callback = self.status === FULFILLED ? deferred.onFulfilled : deferred.onRejected

      // 如果对应回调为null，则直接使用Promise的value
      if (callback === null) {
        resolve(deferred.promise, self.value)
        return
      }

      // 如果回调不为null，则使用回调处理后的值
      var newValue = undefined

      // 此处同样涉及函数调用，无法预知其内部逻辑，所以进行错误捕获
      try {
        newValue = callback(self.value)
      } catch (error) {
        reject(deferred.promise, error)
      }
      resolve(deferred.promise, newValue)
    })
  }
  
  export default IPromise
