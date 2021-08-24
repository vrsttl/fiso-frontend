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
 
  useEffect(() => {
    if (liveDelegation) {
      setCurrentPoolTicker(
        CONSTANTS.allPools.find(
          pool => pool.value === liveDelegation.pool_id
        ).label
      )
      CONSTANTS.originalPools.forEach(async ({ value, label }) =>
        await getDelegatorsForPool(value, label));
    }
  }, [liveDelegation]);

  useEffect(() => {
    if (
      allDelegators &&
      Object.keys(allDelegators).length &&
      Object.keys(allDelegators).length === 10
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
              })})
              .finally(setExtendedDelegatorObject(delegatorWorkingObject));
        }
      }
    }
      getTxHash("ADAHS");
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
      console.log("extended", extendedDelegatorObject);
      const delegatorWorkingObject = { ...extendedDelegatorObject };
      setTimeout(() => {
        const slots = extendedDelegatorObject['ADAHS'].map(
          async delegator => {
            if (delegator.tx) {
              return await axios.get(
              `${CONSTANTS.blockfrostAPI}txs/${delegator.tx}`,
              CONSTANTS.config
            )}
          })
        if (slots) {
          const newItem = {};
          let newSlots = [];
          for (let key in delegatorWorkingObject) {
            newItem[key] = delegatorWorkingObject[key]
          };
          Promise
            .all(slots)
            .then(items => {
              items.forEach(
                (item, index) => {
                  newSlots = [...newSlots, item.data.slot];
                  newItem['ADAHS'][index] = {
                  ...delegatorWorkingObject['ADAHS'][index],
                  slot: item.data.slot,
                };
            })})
            .finally(() => {
              setSlots(newSlots);
              setDelegatorWithTimestamp(newItem)
            });
        }
      }, 40000)
    }
  }, [extendedDelegatorObject]);

  useEffect(() => {
    if (delegatorWithTimestamp) {
      console.log("slots", slots);
      console.log("withTimestamp", delegatorWithTimestamp);
      const updatedList = delegatorWithTimestamp['ADAHS'].map((el, index) => {
        return {
          ...el,
          slot: slots[index],
        }
      });
      const intersectionTime = 37041094;
      console.log("intersectiontime", intersectionTime);
      const filteredDelegations =
        updatedList.filter(
            el => el.slot < intersectionTime
          );
      console.log("newItem", updatedList);
      console.log("filtered", filteredDelegations);
      const sumLiveStake =
        filteredDelegations.reduce(
          (acc, delegation) => acc + +delegation.live_stake, 0
      );
      console.log("sumLiveStake", sumLiveStake);
    }
  }, [delegatorWithTimestamp, stakeKey, slots]);

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
