import { asyncScheduler, forkJoin, from, merge } from 'rxjs'
import {
  catchError,
  delayWhen,
  endWith,
  flatMap,
  filter,
  map,
  mergeScan,
  last,
  pluck,
  publishReplay,
  startWith,
  switchMap,
  throttleTime
} from 'rxjs/operators'
import Messenger, { providers } from '@aragon/rpc-messenger'
import { debug } from './utils'

export const events = {
  ACCOUNTS_TRIGGER: 'ACCOUNTS_TRIGGER',
  SYNC_STATUS_SYNCING: 'SYNC_STATUS_SYNCING',
  SYNC_STATUS_SYNCED: 'SYNC_STATUS_SYNCED'
}

export const AppProxyHandler = {
  get (target, name, receiver) {
    if (name in target) {
      return target[name]
    }

    return function (...params) {
      return target.rpc.sendAndObserveResponse(
        'intent',
        [name, ...params]
      ).pipe(
        pluck('result')
      )
    }
  }
}

/**
 * A JavaScript proxy that wraps RPC calls to the wrapper.
 */
export class AppProxy {
  constructor (provider) {
    this.rpc = new Messenger(provider)
  }

  /**
   * Get an array of the accounts the user currently controls over time.
   *
   * @return {Observable} Multi-emission Observable that emits an array of account addresses every time a change is detected.
   */
  accounts () {
    return this.rpc.sendAndObserveResponses(
      'accounts'
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Get the network the app is connected to over time.
   *
   * @return {Observable} Multi-emission Observable that emits an object with the connected network's id and type every time the network changes.
   */
  network () {
    return this.rpc.sendAndObserveResponses(
      'network'
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Set the app identifier.
   *
   * This identifier is used to distinguish multiple instances of your app,
   * so choose something that provides additional context to the app instance.
   *
   * Examples include: the name of a token that the app manages,
   * the type of content that a TCR is curating, the name of a group etc.
   *
   * @param  {string} identifier The identifier of the app.
   * @return {void}
   */
  identify (identifier) {
    this.rpc.send(
      'identify',
      [identifier]
    )
  }

  /**
   * Get an array of the organization's installed apps.
   *
   * @return {Observable} Multi-emission Observable that emits an array of installed Aragon apps on the organization every time a change is detected.
   */
  getApps () {
    return this.rpc.sendAndObserveResponses(
      'get_apps'
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Resolve an address' identity, using the highest priority provider.
   *
   * @param  {string} address Address to resolve.
   * @return {Observable} Single-emission Observable that emits the resolved identity or null if not found
   */
  resolveAddressIdentity (address) {
    return this.rpc.sendAndObserveResponse(
      'address_identity',
      ['resolve', address]
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Request an address' identity be modified with the highest priority provider.
   *
   * The request is typically handled by the aragon client.
   *
   * @param  {string} address Address to modify.
   * @return {Observable} Single-emission Observable that emits if the modification succeeded or cancelled by the user
   */
  requestAddressIdentityModification (address) {
    return this.rpc.sendAndObserveResponse(
      'address_identity',
      ['modify', address]
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Search for identities that match a given search term.
   *
   * The request is typically handled by the Aragon client.
   *
   * @param  {string} searchTerm Search string
   * @return {Observable} Single-emission Observable that emits with an array of any matching identities
   */
  searchIdentities (searchTerm) {
    return this.rpc.sendAndObserveResponse(
      'search_identities',
      [searchTerm]
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Perform a read-only call on the app's smart contract.
   *
   * @param  {string} method The name of the method to call.
   * @param  {...*} params An optional variadic number of parameters. The last parameter can be the call options (optional). See the [web3.js doc](https://web3js.readthedocs.io/en/1.0/web3-eth-contract.html#id16) for more details.
   * @return {Observable} Single-emission Observable that emits the result of the call.
   */
  call (method, ...params) {
    return this.rpc.sendAndObserveResponse(
      'call',
      [method, ...params]
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Decodes an EVM callscript and tries to describe the transaction path that the script encodes.
   *
   * @param  {string} script The EVM callscript to describe
   * @return {Observable} Single-emission Observable that emits the described transaction path. The emitted transaction path is an array of objects, where each item has a `destination`, `data` and `description` key.
   */
  describeScript (script) {
    return this.rpc.sendAndObserveResponse(
      'describe_script',
      [script]
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Listens for events on your app's smart contract from the last unhandled block.
   *
   * @param  {string} fromBlock Block from which to fetch the events
   * @return {Observable} Multi-emission Observable that emits [Web3 events](https://web3js.readthedocs.io/en/1.0/glossary.html#specification).
   */
  events (fromBlock) {
    return this.rpc.sendAndObserveResponses(
      'events',
      [fromBlock]
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Fetch past events from your app's smart contract for requestsed range
   *
   * @param  {string} fromBlock Block from which to fetch the events
   * @param  {string} toBlock Block up to which to fetch the events
   * @return {Observable} Single-emission Observable that emits an array of [Web3 events](https://web3js.readthedocs.io/en/1.0/glossary.html#specification).
   */
  pastEvents (fromBlock, toBlock) {
    return this.rpc.sendAndObserveResponse(
      'past_events',
      [fromBlock, toBlock]
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Creates a handle to interact with an external contract
   * (i.e. a contract that is **not** your app's smart contract, such as a token).
   *
   * @param  {string} address The address of the external contract
   * @param  {Array<Object>} jsonInterface The [JSON interface](https://web3js.readthedocs.io/en/1.0/glossary.html#glossary-json-interface) of the external contract.
   * @return {Object} An external smart contract handle. Calling any function on this object will send a call to the smart contract and return a single-emission Observable that emits the value of the call.
   */
  external (address, jsonInterface) {
    const contract = {
      events: (fromBlock) => {
        const eventArgs = [
          address,
          jsonInterface.filter(
            (item) => item.type === 'event'
          )
        ]
        if (typeof fromBlock === 'number') {
          eventArgs.push(fromBlock)
        }

        return this.rpc.sendAndObserveResponses(
          'external_events',
          eventArgs
        ).pipe(
          pluck('result')
        )
      },
      pastEvents: (options = {}) => {
        const eventArgs = [
          address,
          jsonInterface.filter(
            (item) => item.type === 'event'
          ),
          options
        ]

        return this.rpc.sendAndObserveResponse(
          'external_past_events',
          eventArgs
        ).pipe(
          pluck('result')
        )
      }
    }

    // Bind calls
    const callMethods = jsonInterface.filter(
      (item) => item.type === 'function' && item.constant
    )
    callMethods.forEach((methodJsonInterface) => {
      contract[methodJsonInterface.name] = (...params) => {
        return this.rpc.sendAndObserveResponse(
          'external_call',
          [address, methodJsonInterface, ...params]
        ).pipe(
          pluck('result')
        )
      }
    })

    return contract
  }

  /**
   * Allow apps to sign arbitrary data via a RPC call
   *
   * @param  {string} message The message to sign
   * @return {void}
   */
  requestSignMessage (message) {
    return this.rpc
      .sendAndObserveResponse('sign_message', [message])
      .pipe(
        pluck('result')
      )
  }

  /**
   * Invoke a whitelisted web3.eth function.
   *
   * @param  {string} method The method to call. Must be in the whitelisted group (mostly getters).
   * @param  {...*} params Parameters for the call
   * @return {Observable} Single-emission Observable that emits the return value of the call.
   */
  web3Eth (method, ...params) {
    return this.rpc.sendAndObserveResponse(
      'web3_eth',
      [method, ...params]
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Set a value in the application cache.
   *
   * @param  {string} key The cache key to set a value for
   * @param  {string} value The value to persist in the cache
   * @return {string} Single-emission Observable that emits when the cache operation has been committed
   */
  cache (key, value) {
    return this.rpc.sendAndObserveResponse(
      'cache',
      ['set', key, value]
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Get a value from the application cache.
   *
   * @param  {string} key The cache key to get a value for
   * @return {Observable} Single-emission Observable with the value for the specified cache key
   */
  getCache (key) {
    return this.rpc.sendAndObserveResponse(
      'cache',
      ['get', key]
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Observe the cached application state over time.
   *
   * This method is also used to share state between the background script and front-end of your application.
   *
   * @return {Observable} Multi-emission Observable that emits the application state every time it changes. The type of the emitted values is application specific.
   */
  state () {
    return this.rpc.sendAndObserveResponses(
      'cache',
      ['get', 'state']
    ).pipe(
      pluck('result')
    )
  }

  /**
   * Application store constructor to be used in app script
   * Listens for events, passes them through `reducer`, caches the resulting state and re-emits that state for easy chaining.
   * Caches results to the `state` key to emit the new state for `api.state()` subscribers (e.g. a frontend).
   *
   * For caching purposes the event fetching is split into two steps:
   *  - Fetching past events with `pastEvents`
   *  - Subscribing to new events
   *
   * The reducer takes the signature `(state, event)` and should return either:
   *  - a promise that resolves to state, even if it is unaltered by the event.
   *  - a new state object
   *
   * Also note that the initial state is always `null`, not `undefined`, because of [JSONRPC](https://www.jsonrpc.org/specification) limitations.
   *
   * Optionally takes an options object with:
   *   - `externals`: an array of external contracts to merge with this app's events,
   *     for example you might use an external contract's Web3 events
   *   - `init`: an initialization function run before events are passed through to the reducer,
   *     useful for refreshing stale state from the contract (e.g. token balances)
   *
   * @param  {Function} reducer A function that reduces events to state. Can return a Promise that resolves to a new state.
   * @param  {Object} [options] An optional options object
   * @param  {Array.<{contract: Object, initializationBlock: String}>} [options.externals] An optional array of objects containing `contract` (as returned from `api.external`) and an optional `initializationBlock` from which to fetch events
   * @param  {Function} [options.init] An optional initialization function for the state. Should return a promise that resolves to the init state.
   * @return {Observable} Multi-emission Observable that emits the application state every time it changes. The type of the emitted values is application specific.
   */
  store (reducer, { externals = [], init } = {}) {
    const CACHED_STATE_KEY = 'CACHED_STATE_KEY'
    const BLOCK_REORG_MARGIN = 100

    // Wrap the reducer in another reducer that allows us to execute code asynchronously
    // in our reducer (due to the Promise wrapping). That's a lot of reducing.
    //
    // This is why we need the `mergeScan` operator below.
    const wrappedReducer = (state, event) =>
      from(
        // Ensure a promise is returned even if the reducer returns an array or throws
        new Promise((resolve) => resolve(reducer(state, event)))
      ).pipe(
        catchError((err) => {
          console.error('Error from app reducer on event', err)
          console.error('Current event', event)
          console.error('Current state', state)
          // Re-throw the error to stop the rest of the store() stream
          throw err
        })
      )

    const getCurrentEvents = (fromBlock) => merge(
      this.events(fromBlock),
      ...externals.map(({ contract }) => contract.events(fromBlock))
    )

    // If `cachedFromBlock` is null there's no cache, `pastEvents` will use the initializationBlock
    // External contracts can specify their own `initializationBlock` which will be used in case the cache is empty,
    // by default they will use the current app's initialization block.
    const getPastEvents = (cachedFromBlock, toBlock) => merge(
      this.pastEvents(cachedFromBlock, toBlock),
      ...externals.map(({ contract, initializationBlock }) => contract.pastEvents({ fromBlock: cachedFromBlock || initializationBlock, toBlock }))
    ).pipe(
      // single emission array of all pastEvents -> flatten to process events
      flatMap(pastEvents => from(pastEvents)),
      startWith({
        event: events.SYNC_STATUS_SYNCING,
        returnValues: {
          from: cachedFromBlock,
          to: toBlock
        }
      }),
      endWith({
        event: events.SYNC_STATUS_SYNCED,
        returnValues: {}
      })
    )
    const cacheValue$ = this.getCache(CACHED_STATE_KEY).pipe(
      // ensure we always get at least an empty object instead of falsy
      map(v => v || {}))
    const latestBlock$ = this.web3Eth('getBlockNumber')
    // init the app state with the cached state
    const initState$ = init
      ? cacheValue$.pipe(
        switchMap(({ state }) => from(init(state))),
        delayWhen((initState) => {
          debug('- store - init state:', initState)
          return this.cache('state', initState)
        })
      )
      : from([null])

    const store$ = forkJoin(cacheValue$, initState$, latestBlock$).pipe(
      switchMap(([cacheValue, initState, latestBlock]) => {
        const { state: cachedState, block: cachedBlock } = cacheValue
        debug('- store - initState', initState)
        debug('- store - cachedState', cachedState)
        debug(`- store - cachedBlock ${cachedBlock} | latestBlock: ${latestBlock}`)

        // The block up to which to fetch past events.
        // The reduced state up to this point will be cached on every load
        const pastEventsToBlock = Math.max(0, latestBlock - BLOCK_REORG_MARGIN)

        debug(`- store - pastEvents: ${cachedBlock} -> ${pastEventsToBlock} (${pastEventsToBlock - cachedBlock} blocks)`)
        debug(`- store - currentEvents$: from: ${pastEventsToBlock} -> future`)

        return getPastEvents(cachedBlock, pastEventsToBlock).pipe(
          mergeScan(wrappedReducer, { ...cachedState, ...initState }, 1),
          // throttle to reduce rendering and caching overthead
          // must keep trailing to avoid discarded events
          throttleTime(1000, asyncScheduler, { leading: false, trailing: true }),
          delayWhen((state) => {
            debug('- store - reduced state from past event:', state)
            return this.cache('state', state)
          }),
          last(),
          delayWhen((state) => {
            debug('caching state:', state)
            return this.cache(CACHED_STATE_KEY, {
              block: pastEventsToBlock,
              state
            })
          }),
          switchMap(pastState => {
            // observable which emits an web3.js event-like object with the address of the active account.
            const accounts$ = this.accounts().pipe(
              map(accounts => {
                return {
                  event: events.ACCOUNTS_TRIGGER,
                  returnValues: {
                    account: accounts[0]
                  }
                }
              })
            )
            // fetch current events from block after cached block
            const currentEvents$ = getCurrentEvents(pastEventsToBlock + 1)

            return merge(currentEvents$, accounts$).pipe(
              mergeScan(wrappedReducer, pastState, 1)
            )
          }),
          // throttle to reduce rendering and caching overthead
          // must keep trailing to avoid discarded events
          throttleTime(250, asyncScheduler, { leading: false, trailing: true }),
          delayWhen((state) => {
            debug('- store - reduced state:', state)
            return this.cache('state', state)
          })
        )
      }),
      publishReplay(1)
    )
    store$.connect()

    return store$
  }

  /**
   * **NOTE: This call is not currently handled by the wrapper**
   *
   * Send a notification.
   *
   * @param {string} title The title of the notification.
   * @param {string} body The body of the notification.
   * @param {Object} [context={}] An optional context that will be sent back to the app if the notification is clicked.
   * @param {Date} [date=new Date()] An optional date that specifies when the notification originally occured.
   * @return {void}
   */
  notify (title, body, context = {}, date = new Date()) {
    return this.rpc.send(
      'notification',
      [title, body, context, date]
    )
  }

  /**
   * **NOTE: The wrapper does not currently send contexts to apps**
   *
   * Listen for app contexts.
   *
   * An app context is an application specific message that the wrapper can send to the app.
   *
   * For example, if a notification or a shortcut is clicked, the context attached to either of those will be sent to the app.
   *
   * App contexts can be used to display specific views in your app or anything else you might find interesting.
   *
   * @return {Observable} Single-emisison Observable that emits app contexts as they are received.
   */
  context () {
    return this.rpc.requests().pipe(
      filter((request) => request.method === 'context'),
      map((request) => request.params[0])
    )
  }
}

/**
 * This class is used to communicate with the wrapper in which the app is run.
 *
 * Every method in this class sends an RPC message to the wrapper through the provider.
 */
export default class AragonApp {
  /**
   * Create a connected AragonApp instance.
   *
   * @param {Object} [provider=MessagePortMessage] The provider used to send and receive messages to and from the wrapper.
   */
  constructor (provider = new providers.MessagePortMessage()) {
    return new Proxy(
      new AppProxy(provider),
      AppProxyHandler
    )
  }
}

// Re-export the Aragon RPC providers
export { providers }
