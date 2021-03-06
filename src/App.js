import { useEffect, useState } from 'react';
import { cloneDeep, sortBy, last } from 'lodash';
import axios from "axios";
import * as CONSTANTS from './constants';
import './App.css';

function App() {
  const [stakeKey, setStakeKey] = useState(CONSTANTS.stakeKey);
  const [errors, setErrors] = useState({});
  const [liveDelegation, setLiveDelegation] = useState(null);
  const [currentPoolTicker, setCurrentPoolTicker] = useState(null);
  const [allDelegators, setAllDelegators] = useState(null);
  const [extendedDelegatorObject, setExtendedDelegatorObject] = useState(null);
  const [delegatorWithTimestamp, setDelegatorWithTimestamp] = useState(null);
  const [finalList, setFinalList] = useState(null);
  const [poolData, setPoolData] = useState(null);
  const [reservePoolInsertionSlot] = useState(37822519);
  const [cutoffSlot, setCutoffSlot] = useState(99999999999);

  useEffect(() => {
    const getData = async () => {
      const data = await axios.get('http://localhost:8000/getPools');
        setPoolData(data.data.result);
      }
    getData();
  }, []);

  useEffect(() => {
    if (poolData) {
      console.log("poolData", poolData);
    }
  }, [poolData]);
 
  useEffect(() => {
    if (liveDelegation && poolData) {
      const ticker = CONSTANTS.allPools.find(
        pool => pool.value === liveDelegation.pool_id
      ).label
    ticker
      ? setCurrentPoolTicker(ticker)
      : setErrors({ error: "This stake key doesn't currently delegate to any of the FISO pools."});
    /* if (ticker) {
      const delegation = poolData[ticker]
        .delegators
        .find(del => del.tx === liveDelegation.tx_hash);
      if (delegation) setCutoffSlot(delegation.slot);
    }*/
      CONSTANTS.allPools.filter(el => el.label === "SOLIA").forEach(async ({ value, label }) =>
        await getDelegatorsForPool(value, label));
    }
  }, [liveDelegation, poolData]);

  useEffect(() => {
    console.log("cutoff", cutoffSlot);
    if (currentPoolTicker && poolData) {
      const earlyDelegator = cutoffSlot < reservePoolInsertionSlot;
      if (CONSTANTS.extendedPools.map(el => el.label).includes(currentPoolTicker) && earlyDelegator) {
        setErrors({
          error:
          `You delegated to ${currentPoolTicker} before it got added to the list of active pools.`
        });
      } else {
          const pools = earlyDelegator
            ? CONSTANTS.originalPools
            : CONSTANTS.allPools;
          //console.log("pools", pools);
          const filteredPoolsWithTransactions = {};
         // console.log("pooldata", poolData);
          pools.forEach(
            ({ label: ticker }) => {
              //console.log("ticker", ticker);
              filteredPoolsWithTransactions[ticker] = poolData[ticker];
            }
          );
          const filteredPoolsWithFilteredTransactions = {};
          for (const pool in filteredPoolsWithTransactions) {
            const filteredDelegators =
              filteredPoolsWithTransactions[pool].delegators
              .filter(transaction => transaction.slot < cutoffSlot)
            const sumLiveStake =
            filteredDelegators.reduce(
              (acc, delegation) => acc + +delegation.live_stake, 0
            );
            filteredPoolsWithFilteredTransactions[pool] = {
              delegators: filteredDelegators,
              sumLiveStake,
            };
          }
          //console.log("filteredPoolswithfiltered", filteredPoolsWithFilteredTransactions);
          const objectsFromEntries =
            Object.entries(filteredPoolsWithFilteredTransactions)
              .map(([key, value]) => ({ ...value, key}));
          const sorted = sortBy(objectsFromEntries, ["sumLiveStake"]);
          //console.log("sorted", sorted);
      }
    }
  }, [cutoffSlot, reservePoolInsertionSlot, currentPoolTicker, poolData]);

  useEffect(() => {
    if (
      liveDelegation &&
      allDelegators &&
      Object.keys(allDelegators).length &&
      Object.keys(allDelegators).length === 1
    ) {
      let delegatorWorkingObject = allDelegators;
      const getTxHash = async (ticker) => {
        const delegators = allDelegators[ticker];
        const stakeKeys = await delegators.map(delegator => delegator.address);
        if (stakeKeys) {
          const txs = [];
          let promise = Promise.resolve();
          stakeKeys.forEach(key => {
            promise = promise.then(() => {
              return new Promise(resolve => {
                txs.push(
                  axios.get(
                    `${CONSTANTS.blockfrostAPI}accounts/${key}/delegations/?order=desc`,
                      CONSTANTS.config
                  ))
                  setTimeout(resolve, 40);
                })
              });
            promise.then(() => {
              if (txs) {
                Promise
                  .all(txs)
                  .then(items => {
                    items.forEach(
                      (item, index) => {
                      delegatorWorkingObject[ticker][index] = {
                        ...delegators[index],
                        tx: item.data,
                      };
                  })
                })
              }
            })
          })
      }
    } 
      let promise = Promise.resolve();
      Object.keys(allDelegators).forEach(label => {
        promise = promise
          .then(() => {
            return new Promise(resolve => {
              getTxHash(label);
              setTimeout(resolve, 10000);
            })
          });
      });
      promise.then(() => setExtendedDelegatorObject(delegatorWorkingObject));
    }
  }, [allDelegators, liveDelegation]);

  const handleSetKey = key => {
    if (key || key === "") {
      setStakeKey(key);
    };
  };
  const getStakingActivity = async () => {
    try {
      const delegations = await axios.get(
        `${CONSTANTS.blockfrostAPI}accounts/${stakeKey}/delegations/?order=desc`,
        CONSTANTS.config
      );
      if (delegations && !delegations.hasOwnProperty("error")) {
        setLiveDelegation(delegations.data[0]);
        setErrors({});
      } 
    }
    catch (error) {
      setErrors({
        error: "This stake key doesn't currently delegate to any of the Minswap FISO pools.",
      });
    };
  };

  useEffect(() => {
    if (extendedDelegatorObject) {
      const delegatorWorkingObject = { ...extendedDelegatorObject };
      let promise = Promise.resolve();
      Object.keys(extendedDelegatorObject).forEach(pool => {
        const newItem = {};
        promise = promise.then(() => {
          return new Promise(resolve => {
            let nestedPromise = Promise.resolve();
            const slots = [];
            extendedDelegatorObject[pool].forEach(
              delegator => {
                nestedPromise = nestedPromise.then(() => {
                  return new Promise(resolve => {
                    if (delegator.tx) {
                      const slotArray = [];
                      delegator.tx.forEach(transaction => {
                        slotArray.push(axios.get(
                          `${CONSTANTS.blockfrostAPI}txs/${transaction.tx_hash}`,
                          CONSTANTS.config
                        ))
                      })
                      slots.push(slotArray);
                    }
                    setTimeout(resolve, 50);
                  })
                })
                nestedPromise.then(() => {
                  if (slots) {
                    for (let key in delegatorWorkingObject) {
                      newItem[key] = delegatorWorkingObject[key]
                    };
                    Promise
                      .all(slots)
                      .then(items => {
                        Promise.all(items.flat(2)).then(s => {
                          s.forEach(
                            (item, index) => {
                              const delegator = delegatorWorkingObject[pool].find(
                                delegator => delegator.tx.some(tx => tx.tx_hash === item.data.hash)
                              );
                              if (delegator) {
                                const { tx } = delegator;
                                const foundTx =
                                  tx.find(transaction => transaction.tx_hash === item.data.hash);
                                if (foundTx) {
                                  foundTx.slot = item.data.slot;
                                }
                              }
                            const foundIndex = newItem[pool].findIndex(el => el.address === delegator.address);
                            newItem[pool][foundIndex] = delegator;
                            newItem[pool] = sortBy(newItem[pool], ["slot"]);
                          })
                        })
                      })
                    }
                });
              })
            setTimeout(resolve, 20000);
          });
        });
        promise.then(() => {
          setDelegatorWithTimestamp(newItem)
        });
      })
    }
  }, [extendedDelegatorObject]);

  useEffect(() => {
    if (delegatorWithTimestamp) {
      const finalObject = {};
      Object.keys(delegatorWithTimestamp).forEach(pool => {
        const intersectionTime = 50000000;
        const filteredDelegations = [];
        delegatorWithTimestamp[pool].forEach(delegator => {
          const transactionToConsider = last(
            sortBy(
              delegator.tx.filter(tx =>
                tx.slot < intersectionTime &&
                tx.pool_id === CONSTANTS.allPools.find(el => el.label === pool).value)
              ),
              ["slot"]
            );
        filteredDelegations.push(transactionToConsider);
        })
        console.log("filteredDel", filteredDelegations);
        const sumLiveStake =
          filteredDelegations.reduce(
            (acc, delegation) => acc + +delegation.amount, 0
        );
        Object.assign(finalObject, {
          [pool]: {
            delegators: delegatorWithTimestamp[pool],
            sumLiveStake,
          },
        });
      })
      setFinalList(finalObject);
    }
  }, [delegatorWithTimestamp, stakeKey]);

  useEffect(() => {
    if (finalList) console.table("finalList", [finalList, JSON.stringify(finalList)]);
  }, [finalList]);

  const getDelegatorsForPool = async (poolId, ticker) => {
    try {
      const getDelegators = async (number, list = []) => {
        let partialDelegators = cloneDeep(list);
        const newCall =  await axios.get(
          `${CONSTANTS.blockfrostAPI}pools/${poolId}/delegators/?page=${number}`,
          CONSTANTS.config
        );
        if (newCall.data) {
          partialDelegators = [...partialDelegators, ...newCall.data];
        }
        if (partialDelegators.length % 100 === 0 && newCall.data && newCall.data.length > 0) {
          number++;
          return await getDelegators(number, partialDelegators);
        } else if (partialDelegators) {
          return partialDelegators;
        }
      }
      const delegators = await getDelegators(1);
      if (delegators && !delegators.hasOwnProperty("error")) {
        setAllDelegators(prev => ({ ...prev, [ticker]: delegators }));
        setErrors({});
      } 
    }
    catch (error) {
      setErrors({
        error: error.response,
      });
    };
  };

  return (
    <div className="App">
      <h2>Input stake key here</h2>
      <input
        type="text"
        onChange={({ target }) => handleSetKey(target.value)}
        onPaste={({ target }) => handleSetKey(target.value)}
        value={stakeKey}
      />
      <button
        onClick={getStakingActivity}
        disabled={!(stakeKey && stakeKey.length === 59 && stakeKey.substring(0, 5) === 'stake')}
      >Check your stake pool status</button>
      {currentPoolTicker && (
        <>
          <div>Your current pool is:</div>
          <div>{currentPoolTicker}</div>
        </>
        )
      }
      {errors.error && <div>{errors.error}</div>}
    </div>
  );
}

export default App;
