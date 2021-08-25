import { useEffect, useState } from 'react';
import { cloneDeep } from 'lodash';
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
  const [slots, setSlots] = useState([]);
  const [finalList, setFinalList] = useState(null);
 
  useEffect(() => {
    if (liveDelegation) {
      setCurrentPoolTicker(
        CONSTANTS.extendedPools.find(
          pool => pool.value === liveDelegation.pool_id
        ).label
      )
      CONSTANTS.extendedPools.forEach(async ({ value, label }) =>
        await getDelegatorsForPool(value, label));
    }
  }, [liveDelegation]);

  useEffect(() => {
    if (
      allDelegators &&
      Object.keys(allDelegators).length &&
      Object.keys(allDelegators).length === 15
    ) {
      let delegatorWorkingObject = allDelegators;
      const getTxHash = async (ticker) => {
        const delegators = allDelegators[ticker];
        const stakeKeys = await delegators.map(delegator => delegator.address);
        if (stakeKeys) {
          const txs = stakeKeys.map(async key => await axios.get(
            `${CONSTANTS.blockfrostAPI}accounts/${key}/delegations/?order=desc`,
            CONSTANTS.config
          ));
          if (txs) {
            Promise
              .all(txs)
              .then(items => {
                items.forEach(
                  (item, index) => {
                  delegatorWorkingObject[ticker][index] = {
                    ...delegators[index],
                    tx: item.data[0].tx_hash,
                  };
              })
            })
        }
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
  }, [allDelegators]);

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
        error: error.response.data.message,
      });
    };
  };

  useEffect(() => {
    if (extendedDelegatorObject) {
      const delegatorWorkingObject = { ...extendedDelegatorObject };
      let promise = Promise.resolve();
      Object.keys(extendedDelegatorObject).forEach(pool => {
        console.log("pool ticker", pool);
        const newItem = {};
        let newSlots = [];
        promise = promise.then(() => {
          return new Promise(resolve => {
            let nestedPromise = Promise.resolve();
            const slots = [];
            extendedDelegatorObject[pool].forEach(
              delegator => {
                nestedPromise = nestedPromise.then(() => {
                  return new Promise(resolve => {
                    if (delegator.tx) {
                      slots.push(axios.get(
                      `${CONSTANTS.blockfrostAPI}txs/${delegator.tx}`,
                      CONSTANTS.config
                    ))}
                    setTimeout(resolve, 50);
                  })
                })
                nestedPromise.then(() => {
                  console.log("promise 3", slots)
                  if (slots) {
                    for (let key in delegatorWorkingObject) {
                      newItem[key] = delegatorWorkingObject[key]
                    };
                    Promise
                      .all(slots)
                      .then(items => {
                        console.log("items", items);
                        items.forEach(
                          (item, index) => {
                            const { hash, slot } = item.data;
                            const delegator = delegatorWorkingObject[pool].find(
                              transaction => transaction.tx === hash
                            );
                            Object.assign(delegator, { slot });
                            newSlots = [...newSlots, slot];
                            newItem[pool][index] = delegator;                          
                      })})
                    }
                });
              })
            setTimeout(resolve, 60000);
          });
        });
        promise.then(() => {
          setSlots(newSlots);
          setDelegatorWithTimestamp(newItem)
        });
      })
    }
  }, [extendedDelegatorObject]);

  useEffect(() => {
    if (delegatorWithTimestamp) {
      console.log("delegatorwithtimestamp", delegatorWithTimestamp);
      const finalObject = {};
      Object.keys(delegatorWithTimestamp).forEach(pool => {
        const updatedList = delegatorWithTimestamp[pool].map((el, index) => {
          return {
            ...el,
            slot: slots[index],
          }
        });
        const intersectionTime = 50000000;
        const filteredDelegations =
          updatedList.filter(
              el => el.slot < intersectionTime
            );
        const sumLiveStake =
          filteredDelegations.reduce(
            (acc, delegation) => acc + +delegation.live_stake, 0
        );
        Object.assign(finalObject, {
          [pool]: {
            delegators: updatedList,
            sumLiveStake,
          },
        });
      })
      setFinalList(finalObject);
    }
  }, [delegatorWithTimestamp, stakeKey, slots]);

  useEffect(() => {
    if (finalList) console.log("finalList", finalList);
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
        value={stakeKey}
      />
      <button onClick={getStakingActivity} disabled={!stakeKey}>Check your stake pool status</button>
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
