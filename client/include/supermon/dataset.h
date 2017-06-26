/* This file is part of Supermon project

 Supermon is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 Supermon is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with Supermon.  If not, see http://www.gnu.org/licenses/
 */

#ifndef supermon_data_h
#define supermon_data_h

#include <vector>
#include <functional>
#include <type_traits>

#include "boost/algorithm/string/replace.hpp"

namespace supermon
{

    class dataset
    {
    public:
        class row : public std::vector<std::function<std::ostream& (std::ostream&)>>
        {
        public:
            template<typename T>
            void add(T&& value)
            {
                if (std::is_arithmetic<typename std::decay<T>::type>::value)
                {
                    push_back([value](std::ostream& os) -> std::ostream& { os << value; return os; });
                }
                else
                {
                    push_back([value](std::ostream& os) -> std::ostream& { os << '"' << value << '"'; return os; });
                }
            }

            void add(const std::string& value)
            {
                push_back([value = boost::algorithm::replace_all_copy(value, "\"", "\\\"")](std::ostream& os) -> std::ostream& { os << '"' << value << '"'; return os; });
            }

            template<typename ...ARGS>
            void add_pack(ARGS&& ...args)
            {
                int dummy[sizeof...(ARGS)] = { (add(args), 0)... };
                (void)dummy;
            }
        };

    public:
        template<typename ...ARGS>
        void insert(ARGS&& ...args)
        {
            row& r = *(_rows.emplace(_rows.end()));
            r.add_pack(std::forward<ARGS>(args)...);
        }

    public:
        friend std::ostream& operator<<(std::ostream& os, const dataset& data)
        {
            os << "[";
            bool first_row = true;
            for (const auto& row : data._rows)
            {
                if (!first_row) os << ",";
                else first_row = false;
                os << "[";
                bool first_cell = true;
                for (const auto& cell : row)
                {
                    if (!first_cell) os << ",";
                    else first_cell = false;
                    cell(os);
                }
                os << "]";
            }
            os << "]";
            return os;
        }

    private:
        std::vector<row> _rows;
    };
    
}

#endif
