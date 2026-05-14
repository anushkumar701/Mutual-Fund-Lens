// hooks/useFunds.js
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BASE_URL = 'https://api.mfapi.in/mf';
let cachedList = null;

export function useFunds() {
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFunds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (cachedList) {
        setFunds(cachedList);
        setLoading(false);
        return;
      }
      const res = await axios.get(BASE_URL, { timeout: 15000 });
      cachedList = res.data;
      setFunds(res.data);
    } catch (err) {
      setError('Unable to load funds. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  return { funds, loading, error, refetch: fetchFunds };
}

export async function fetchFundDetail(schemeCode) {
  const res = await axios.get(`${BASE_URL}/${schemeCode}`, { timeout: 15000 });
  return res.data;
}
